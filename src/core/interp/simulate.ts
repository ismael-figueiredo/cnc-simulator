// G-code interpreter. Every G/M code goes through the control's code table and becomes a function
// ("rapid", "polar-on", "brake-on"…); nothing here is specific to one brand. Diagnostics go through
// the control's alarm catalog: a mapped check becomes the machine's alarm and stops the program at
// that block, as on the machine. Ported from docs/legacy/Simulador_Fanuc.html.
import type { ToolOffset, ToolOffsets, WorkOffsets } from '../config/project'
import { defaultToolOffsets, gaugeLength, holderOf } from '../tooling'
import type { AlarmCatalog, Control, Machine, ToolLibrary } from '../config/schema'
import { Expr, MacroError, type MacroErrorKind, type Value, type VariableReader } from '../macro/expr'
import { parseProgram, type Block } from '../program/parse'
import type {
  Diagnostic,
  MachineAlarm,
  ModalState,
  Move,
  MoveKind,
  PlaneElement,
  ProgramPosition,
  Severity,
  SimulationResult,
  ToolUse,
  VariableChange,
  Vec3
} from '../types'
import { machineAlarm as catalogAlarm } from './alarms'
import { arcThrough } from './arcs'
import { AXES, D2R, isAxis, lerpPosition, positionOf, type Axis, type Position } from './axes'
import { buildCodeTable, formatCode, type GFn } from './codes'
import { cutCorner, type Corner } from './corner'
import { toolOffsetSetting, workOffsetName, writeWorkOffset } from './dataSetting'
import { applyCutterComp } from './cutterComp'
import { patternRepeat, roughFace, roughTurn, singleCycle, threadPasses, type P2, type Step } from './latheCycles'
import type { DiagnosticCode } from './diagnostics'
import { illegalProgramNumber, loadIssues } from './loadChecks'
import { findLoopEnd, findLoopStart, findSequence, isNcBlock, usesMacro } from './flow'
import { isIgnoredWrite, isReadOnly, isValidVariable, LAST_COMMON, LAST_LOCAL, MODAL, positionVariable, SYSTEM } from './variables'
import { createWordReader, DIMENSION } from './words'

export interface SimulationOptions {
  /** Skip blocks that start with "/". */
  blockDelete?: boolean
  /** Variables held at a fixed value; the program's assignments to them are ignored. */
  forcedVariables?: Record<number, number>
  maxMoves?: number
  maxBlocks?: number
}

export interface SimulationInput {
  text: string
  control: Control
  machine: Machine
  tools?: ToolLibrary | null
  /** The control's alarm catalog (control.alarms names it). */
  alarms?: AlarmCatalog | null
  /**
   * Work offset table before the run (machine position of each part zero). The path is drawn in the
   * G54 frame; G55… are shifted by their difference to G54, and G54's own values place machine zero.
   */
  workOffsets?: WorkOffsets
  /** Tool offset table (H/D on machining centers, geometry/wear on lathes); defaults from the tools. */
  toolOffsets?: ToolOffsets
  options?: SimulationOptions
}

const DEFAULT_LIMITS = {
  maxDigits: 8,
  maxValue: 99999.999,
  subprogramNesting: 4,
  macroNesting: 4,
  bracketNesting: 5,
  loopIds: 3,
  maxSequenceNumber: 99999,
  maxProgramNumber: 9999,
  compNoMoveBlocks: 1,
  arcTolerance: 0.02,
  toolOffsets: 999
}
const DEFAULT_FORMAT = {
  startPercent: false,
  endPercent: false,
  eob: 'newline' as 'semicolon' | 'newline',
  missingEob: 'off' as 'alarm' | 'warning' | 'off',
  programNumber: 'optional' as 'required' | 'optional',
  requireDecimalPoint: false
}

/** Fanuc G65 argument letters → local variables #1…#26 (argument specification I). */
const G65_ARGS: Record<string, number> = {
  A: 1, B: 2, C: 3, I: 4, J: 5, K: 6, D: 7, E: 8, F: 9, H: 11, M: 13,
  Q: 17, R: 18, S: 19, T: 20, U: 21, V: 22, W: 23, X: 24, Y: 25, Z: 26
}
/** Functions the control accepts while polar coordinate interpolation (G12.1) is on. */
const POLAR_ALLOWED = new Set<GFn>([
  'linear', 'arc-cw', 'arc-ccw', 'dwell', 'cutter-comp-cancel', 'cutter-comp-left', 'cutter-comp-right',
  'absolute', 'incremental', 'feed-per-minute', 'feed-per-rev', 'polar-off', 'macro-call', 'macro-modal',
  'macro-modal-cancel', 'other'
])

const MACRO_ERROR_CODE: Record<MacroErrorKind, DiagnosticCode> = {
  expression: 'macro-expression-error',
  format: 'macro-format-error',
  'division-by-zero': 'macro-division-by-zero',
  'unknown-word': 'macro-unknown-word',
  'illegal-argument': 'macro-illegal-argument',
  'bracket-nesting': 'bracket-nesting'
}

/** Reads a tool radius from a comment such as "(FRESA 8MM)", "(D.12mm)" or "(Ø6)". */
export function toolRadiusFromComment(comment: string): number | null {
  if (!comment) return null
  const s = comment.toUpperCase().replace(',', '.')
  const m = /(?:Ø|D\.?|DIAM\.?|DIA\.?)\s*(\d+(?:\.\d+)?)/.exec(s) ?? /(\d+(?:\.\d+)?)\s*MM/.exec(s)
  if (!m?.[1]) return null
  const d = parseFloat(m[1])
  return d > 0 && d < 200 ? d / 2 : null
}

/** Unwinds the run after the diagnostic that stops the machine was already reported. */
class Stop extends Error {}
/** #3000 = n: the program raised its own alarm. */
class MacroAlarm extends Error {
  constructor(readonly num: number) {
    super(`#3000=${num}`)
  }
}

interface Cycle {
  fn: GFn
  code: string
  /** Level the tool returns to with G98 (Z, or X for radial cycles). */
  initial: number
  depth?: number
  r?: number
  q?: number
}

export function simulate(input: SimulationInput): SimulationResult {
  const { control, machine, tools } = input
  const catalog = input.alarms && (!control.alarms || control.alarms === input.alarms.id) ? input.alarms : null
  const opt = input.options ?? {}
  const dialect = control.dialect
  const integerDecimal = dialect.integerAddressDecimal ?? 'alarm'
  const hasLiveTool = machine.spindles.some((s) => s.type === 'live')
  const limits = { ...DEFAULT_LIMITS, ...control.limits }
  const format = { ...DEFAULT_FORMAT, ...control.fileFormat }
  const lathe = machine.kinematics.startsWith('lathe')
  const latheControl = control.machineType === 'lathe'
  const codes = buildCodeTable(control)
  const rules = new Set(control.rules ?? [])
  const machineAxes = new Set<string>(machine.axes.map((a) => a.name))
  const incremental = new Map<string, Axis>()
  for (const [k, v] of Object.entries(dialect.incrementalAddresses ?? {})) if (isAxis(v)) incremental.set(k, v)
  const xDia = dialect.xDiameter ? 2 : 1
  const linearRapids = machine.axes.filter((a) => a.type === 'linear').map((a) => a.rapid)
  const rapidRate = linearRapids.length ? Math.min(...linearRapids) : 10000
  const liveSpindle = Number(/S(\d)=/.exec(dialect.liveToolSpeedAddress ?? '')?.[1] ?? 2)
  const maxMoves = opt.maxMoves ?? 400_000
  const maxBlocks = opt.maxBlocks ?? 3_000_000

  const { blocks, programs, layout } = parseProgram(input.text, dialect.comment)
  const moves: Move[] = []
  const diagnostics: Diagnostic[] = []
  const variables: VariableChange[] = []
  const toolsUsed: ToolUse[] = []
  const reported = new Set<string>()
  /** > 0 while a cycle's contour blocks are read for their geometry only. */
  let quiet = 0
  let line = 0
  let stoppedBy: Diagnostic | undefined

  // ---------- diagnostics and alarms ----------
  const machineAlarm = (code: DiagnosticCode, params?: Record<string, string | number>): MachineAlarm | undefined => catalogAlarm(catalog, code, params)

  /** Records a diagnostic; when the control maps it to an alarm that stops, unwinds the run. */
  function diag(
    severity: Severity,
    code: DiagnosticCode,
    params?: Record<string, string | number>,
    onceKey?: string | number,
    fileLevel = false
  ): void {
    // Reading a cycle's contour runs its blocks silently: their checks belong to the real run
    if (quiet > 0) return
    if (onceKey !== undefined) {
      const k = `${code}|${onceKey}`
      if (reported.has(k)) return
      reported.add(k)
    }
    const alarm = machineAlarm(code, params)
    if (alarm && fileLevel) alarm.stops = false // load checks are reported, the program still runs
    const d: Diagnostic = { severity: alarm ? 'alarm' : severity, line, code, moveIndex: moves.length }
    if (params) d.params = params
    if (alarm) d.alarm = alarm
    diagnostics.push(d)
    if (alarm?.stops) {
      stoppedBy = d
      throw new Stop()
    }
  }
  /** A check the machine always stops on, even when the catalog does not name the alarm. */
  function fatal(code: DiagnosticCode, params?: Record<string, string | number>): never {
    if (quiet > 0) throw new Stop()
    diag('alarm', code, params)
    stoppedBy ??= diagnostics[diagnostics.length - 1]
    throw new Stop()
  }

  // ---------- work offsets ----------
  // Positions are kept in the frame of G54 as set before the run (where the stock sits).
  // Without G54 values, machine zero falls back to the machine's toolChangePosition.
  const tc = machine.toolChangePosition
  const table = new Map<string, Partial<Record<Axis, number>>>(Object.entries(input.workOffsets ?? {}))
  const base: Partial<Record<Axis, number>> = { ...table.get('G54') }
  const configuredOffsets = table.size > 0
  const shiftOf = (name: string): Position => {
    const o = table.get(name) ?? {}
    return positionOf((ax) => (ax === 'X' || ax === 'Y' || ax === 'Z' ? (o[ax] ?? 0) - (base[ax] ?? 0) : 0))
  }
  /** Machine zero in the drawing frame. */
  const machineZero = positionOf((ax) => (base[ax] !== undefined ? -(base[ax] ?? 0) : (tc[ax] ?? 0)))
  let shift = shiftOf('G54')

  // ---------- state ----------
  const pos: Position = { ...machineZero }
  /** A ",C"/",R" block waits for the next move to know the corner it rounds or chamfers. */
  let corner: Corner | null = null
  const st = {
    motion: 0 as 0 | 1 | 2 | 3,
    absolute: true,
    plane: (latheControl ? 18 : 17) as 17 | 18 | 19,
    polar: false,
    px: 0,
    py: 0,
    cutterComp: 40 as 40 | 41 | 42,
    compStartPending: null as 41 | 42 | null,
    compCancelPending: false,
    compNoMove: 0,
    feed: 0,
    feedPerMinute: !latheControl,
    spindleSpeed: 0,
    liveToolSpeed: 0,
    lastSpeedWasLive: false,
    spindleOn: false,
    liveToolOn: false,
    tool: 0,
    offset: 0,
    pendingTool: null as { t: number; comment: string } | null,
    workOffset: 'G54',
    /** H number of G43/G44 in effect, or null after G49. */
    lengthComp: null as number | null,
    /** D number given with G41/G42 (null: the tool's own radius). */
    dNumber: null as number | null,
    /** G90/G94/G92 (G77/G79/G78) single cycle in effect: axis words repeat it from the same start point. */
    single: null as 'turn' | 'face' | 'thread' | null,
    /** End point of the last single cycle: an axis left out of a repeat block keeps it. */
    singleEnd: null as P2 | null,
    /** G32/G33: the linear feed is a thread (F is the lead per revolution). */
    threading: false,
    /** First blocks of G71/G72/G73/G76, kept for their second block. */
    roughTurn: { depth: 0, retract: 0 },
    roughFace: { depth: 0, retract: 0 },
    pattern: { reliefX: 0, reliefZ: 0, count: 1 },
    thread: { repeats: 1, minDepth: 0.1, finish: 0.05 },
    cAxisEnabled: false,
    brake: false,
    tailstock: false,
    cycle: null as Cycle | null,
    returnToR: false
  }
  const radiusByTool = new Map<number, number>()

  // ---------- variables ----------
  const commons = new Map<number, Value>()
  const locals: Map<number, Value>[] = [new Map<number, Value>()]
  const forced = new Map<number, number>()
  for (const [k, v] of Object.entries(opt.forcedVariables ?? {})) forced.set(Number(k), v)
  forced.forEach((value, n) => variables.push({ moveIndex: 0, n, value }))

  const programC = () => (st.polar ? st.py : pos.C)
  /** X in the active work offset (polar mode has no work shift on X/C). */
  const absX = () => (st.polar ? st.px * xDia : pos.X - shift.X)

  const vars: VariableReader & { set: (n: number, v: Value) => void } = {
    get(n) {
      if (!isValidVariable(n)) fatal('variable-number-invalid', { n })
      if (n === 0) return null
      const f = forced.get(n)
      if (f !== undefined) return f
      if (n <= LAST_LOCAL) return locals[locals.length - 1]?.get(n) ?? null
      if (n <= LAST_COMMON) return commons.get(n) ?? null
      if (n === MODAL.motion) return st.motion
      if (n === MODAL.distance) return st.absolute ? 90 : 91
      if (n === MODAL.feed) return st.feed
      if (n === MODAL.spindleSpeed) return st.spindleSpeed
      if (n === MODAL.tool) return st.tool
      const pv = positionVariable(n)
      const axis = pv ? machine.axes[pv.axisIndex]?.name : undefined
      if (pv && axis && isAxis(axis)) {
        if (axis === 'C') return programC()
        if (pv.frame === 'machine') return pos[axis] - machineZero[axis]
        return axis === 'X' ? absX() : pos[axis] - shift[axis]
      }
      if ((SYSTEM.clocks as readonly number[]).includes(n)) return moves.length
      diag('warning', 'system-variable-not-simulated', { n }, n)
      return null
    },
    set(n, v) {
      if (!isValidVariable(n) || n === 0) fatal('variable-number-invalid', { n })
      if (isReadOnly(n)) fatal('variable-write-protected', { n })
      if (forced.has(n)) {
        diag('info', 'forced-variable', { n, value: forced.get(n) ?? 0 }, n)
        return
      }
      if (n <= LAST_LOCAL) locals[locals.length - 1]?.set(n, v)
      else if (n <= LAST_COMMON) commons.set(n, v)
      else if (n === SYSTEM.alarm) throw new MacroAlarm(v ?? 0)
      else if (n === SYSTEM.message) {
        diag('info', 'macro-message', { value: v ?? 0 })
        return
      } else if (isIgnoredWrite(n)) return
      else {
        diag('warning', 'system-variable-write', { n }, n)
        return
      }
      variables.push({ moveIndex: moves.length, n, value: v })
    }
  }
  const ex: Expr = new Expr(vars, limits.bracketNesting)

  // ---------- tool offsets ----------
  const offsetTable = new Map<number, ToolOffset>(
    Object.entries(input.toolOffsets ?? defaultToolOffsets(tools ?? null, latheControl)).map(([k, v]) => [Number(k), { ...v }])
  )
  const offsetOf = (n: number): ToolOffset => offsetTable.get(n) ?? {}
  const hasLengthComp = [...codes.g.values()].includes('tool-length-comp')
  /** Spindle gauge line to tip of a tool in the library (undefined when unknown). */
  const gaugeOf = (n: number) => {
    const tool = tools?.tools.find((x) => x.number === n)
    return tool ? gaugeLength(tool, holderOf(tool, tools ?? null, false)) : undefined
  }
  /** Where the tip really is against the programmed point: a wrong H, or wear (radial on lathes). */
  const tipShift = { r: 0, z: 0 }
  /** Machine position of the gauge line (H on mills) or of the turret (geometry + wear on lathes). */
  const machineExtra = { X: 0, Z: 0 }
  function updateOffsets(): void {
    tipShift.r = 0
    tipShift.z = 0
    machineExtra.X = 0
    machineExtra.Z = 0
    if (latheControl) {
      const e = offsetOf(st.offset)
      tipShift.r = (e.xWear ?? 0) / xDia
      tipShift.z = e.zWear ?? 0
      machineExtra.X = (e.x ?? 0) + (e.xWear ?? 0)
      machineExtra.Z = (e.z ?? 0) + (e.zWear ?? 0)
      return
    }
    if (st.lengthComp === null) return
    const e = offsetOf(st.lengthComp)
    const value = (e.length ?? 0) + (e.lengthWear ?? 0)
    machineExtra.Z = value
    const actual = gaugeOf(st.tool)
    // G43: gauge line at Z + H, so the tip is at Z + H − (real gauge length)
    if (actual !== undefined) tipShift.z = value - actual
  }
  /** Offset part of the machine position on an axis (Z on mills, X and Z on lathes). */
  const extraOf = (ax: Axis) => (ax === 'X' ? machineExtra.X : ax === 'Z' ? machineExtra.Z : 0)
  /** Points as the tool really goes: the length or wear error moves them, as on the machine. */
  const applyTipShift = (points: Vec3[]): Vec3[] => {
    if (!tipShift.r && !tipShift.z) return points
    return points.map(([x, y, z]) => {
      const r = Math.hypot(x, y)
      const k = tipShift.r && r > 1e-9 ? (r + tipShift.r) / r : 1
      return [x * k, y * k, z + tipShift.z]
    })
  }

  // ---------- geometry ----------
  const latheWorld = (X: number, C: number, Y: number, Z: number): Vec3 => {
    const r = X / xDia
    const a = C * D2R
    return [r * Math.cos(a) - Y * Math.sin(a), r * Math.sin(a) + Y * Math.cos(a), Z]
  }
  const toWorld = (p: Position): Vec3 => (lathe ? latheWorld(p.X, p.C, p.Y, p.Z) : [p.X, p.Y, p.Z])
  const worldNow = (): Vec3 => (st.polar ? [st.px, st.py, pos.Z] : toWorld(pos))
  /** Radius for compensation: the D offset (mills) or the nose radius (lathes), else the tool's own. */
  const toolRadius = () => {
    if (latheControl) {
      const e = offsetOf(st.offset)
      if (e.nose !== undefined) return e.nose + (e.noseWear ?? 0)
    } else if (st.dNumber !== null) {
      const e = offsetOf(st.dNumber)
      if (e.radius !== undefined) return e.radius + (e.radiusWear ?? 0)
    }
    return radiusByTool.get(st.tool) ?? 0
  }
  /** Turning on a lathe: G18 without polar interpolation, compensated with the nose radius. */
  const turningPlane = () => lathe && !st.polar && st.plane === 18
  const inCompPlaneNow = () => st.polar || (!lathe && st.plane === 17) || turningPlane()

  const snapshot = (): { state: ModalState; position: ProgramPosition; machinePosition: ProgramPosition } => ({
    state: {
      motion: st.motion,
      absolute: st.absolute,
      plane: st.plane,
      polar: st.polar,
      cutterComp: st.cutterComp,
      feed: st.feed,
      feedPerMinute: st.feedPerMinute,
      spindleSpeed: st.spindleSpeed,
      liveToolSpeed: st.liveToolSpeed,
      spindleOn: st.spindleOn,
      liveToolOn: st.liveToolOn,
      tool: st.tool,
      offset: st.offset,
      cAxisEnabled: st.cAxisEnabled,
      brake: st.brake,
      tailstock: st.tailstock,
      cycle: st.cycle?.code ?? null,
      workOffset: st.workOffset
    },
    position: { X: absX(), Y: pos.Y - shift.Y, Z: pos.Z - shift.Z, A: pos.A, B: pos.B, C: programC() },
    machinePosition: {
      X: pos.X - machineZero.X + machineExtra.X,
      Y: pos.Y - machineZero.Y,
      Z: pos.Z - machineZero.Z + machineExtra.Z,
      A: pos.A,
      B: pos.B,
      C: programC()
    }
  })

  /** Travel limits are checked only on axes whose G54 was given: otherwise machine zero is a guess. */
  function checkTravel(): void {
    if (!configuredOffsets) return
    for (const a of machine.axes) {
      if (a.type !== 'linear' || base[a.name as Axis] === undefined || !isAxis(a.name)) continue
      const m = pos[a.name] - machineZero[a.name] + extraOf(a.name)
      if (m < a.min - 1e-6 || m > a.max + 1e-6)
        diag('warning', 'overtravel', { axis: a.name, value: Math.round(m * 1000) / 1000, min: a.min, max: a.max }, `ot${a.name}${m > a.max ? '+' : '-'}`)
    }
  }

  function pushMove(kind: MoveKind, points: Vec3[], extra: Partial<Move> = {}, dwellS = 0): Move {
    let length = 0
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1] as Vec3
      const b = points[i] as Vec3
      length += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    }
    let durationS = dwellS
    if (kind === 'rapid') durationS = (length / rapidRate) * 60
    else if (kind === 'feed') {
      if (!(st.feed > 0)) diag('alarm', 'feed-undefined', undefined, line)
      let perMin = st.feed
      if (!st.feedPerMinute) perMin = st.feed * (st.liveToolOn ? st.liveToolSpeed : st.spindleSpeed)
      if (!(perMin > 0)) {
        // Feed per revolution with the spindle stopped: the machine waits instead of moving
        diag('warning', 'spindle-not-running', { feed: st.feed }, line)
        perMin = 100
      }
      durationS = (length / perMin) * 60
    }
    // Cutting on a machining center without G43: the tip would be a whole tool length lower
    if (kind === 'feed' && !latheControl && hasLengthComp && st.tool > 0 && st.lengthComp === null)
      diag('warning', 'length-comp-off', { tool: st.tool, length: Math.round((gaugeOf(st.tool) ?? 0) * 1000) / 1000 }, `lc${st.tool}`)
    const m: Move = { kind, line, points: applyTipShift(points), toolRadius: toolRadius(), durationS, ...snapshot(), ...extra, ...(threadMove && kind === 'feed' ? { thread: true } : {}) }
    moves.push(m)
    if (moves.length > maxMoves) fatal('too-many-moves', { max: maxMoves })
    return m
  }

  interface Target {
    pos: Position
    px: number
    py: number
  }

  function linear(kind: 'rapid' | 'feed', t: Target): Move | null {
    const a = { ...pos }
    const apx = st.px
    const apy = st.py
    let points: Vec3[]
    if (st.polar) {
      points = [
        [st.px, st.py, a.Z],
        [t.px, t.py, t.pos.Z]
      ]
    } else {
      // X/C (or A) interpolate together: a C move draws a spiral, as on the machine
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(t.pos.C - a.C), Math.abs(t.pos.A - a.A)) / 2))
      points = []
      for (let k = 0; k <= n; k++) points.push(toWorld(lerpPosition(a, t.pos, k / n)))
    }
    const p0 = points[0] as Vec3
    const p1 = points[points.length - 1] as Vec3
    const moved = Math.abs(p0[0] - p1[0]) + Math.abs(p0[1] - p1[1]) + Math.abs(p0[2] - p1[2]) >= 1e-9
    const extra: Partial<Move> = {}
    if (moved && inCompPlaneNow()) {
      extra.inCompPlane = true
      // Turning: the plane is Z (u) and the radius (v)
      const turning = turningPlane()
      if (turning) extra.compPlane = 'zx'
      const u0 = st.polar ? apx : turning ? a.Z : a.X
      const v0 = st.polar ? apy : turning ? a.X / xDia : a.Y
      const u1 = st.polar ? t.px : turning ? t.pos.Z : t.pos.X
      const v1 = st.polar ? t.py : turning ? t.pos.X / xDia : t.pos.Y
      if (Math.hypot(u1 - u0, v1 - v0) > 1e-9) extra.element = { type: 'line', p0: [u0, v0], p1: [u1, v1] }
    }
    // The move records the state at its end point
    Object.assign(pos, t.pos)
    checkTravel()
    if (st.polar) {
      st.px = t.px
      st.py = t.py
    }
    return moved ? pushMove(kind, points, extra) : null
  }

  // Plane axes as [u, v], the center words, and the axis allowed for a helix: G17 XY (I,J), G18 ZX (K,I), G19 YZ (J,K)
  const PLANES = {
    17: { u: 'X', v: 'Y', cu: 'I', cv: 'J', helix: 'Z' },
    18: { u: 'Z', v: 'X', cu: 'K', cv: 'I', helix: 'Y' },
    19: { u: 'Y', v: 'Z', cu: 'J', cv: 'K', helix: 'X' }
  } as const

  function arc(cw: boolean, t: Target, W: Partial<Record<string, number>>): Move {
    const pl = PLANES[st.plane]
    // X on a lathe is a diameter; arcs are computed with the radius
    const scaleOf = (ax: Axis) => (ax === 'X' && lathe ? xDia : 1)
    const R = W['R']
    const centerWords = st.polar ? ['I', 'J', 'K'] : [pl.cu, pl.cv]
    if (R === undefined && !centerWords.some((k) => W[k] !== undefined)) fatal('arc-center-missing')
    if (R !== undefined && R < 0 && latheControl) fatal('arc-negative-radius', { r: R })
    let u0: number, v0: number, u1: number, v1: number
    if (st.polar) {
      u0 = st.px
      v0 = st.py
      u1 = t.px
      v1 = t.py
    } else {
      u0 = pos[pl.u] / scaleOf(pl.u)
      v0 = pos[pl.v] / scaleOf(pl.v)
      u1 = t.pos[pl.u] / scaleOf(pl.u)
      v1 = t.pos[pl.v] / scaleOf(pl.v)
    }
    const center =
      R !== undefined
        ? { r: R }
        : st.polar
          ? { iu: W['I'] ?? 0, iv: W['J'] ?? W['K'] ?? 0 }
          : { iu: W[pl.cu] ?? 0, iv: W[pl.cv] ?? 0 }
    const result = arcThrough(u0, v0, u1, v1, cw, center)
    if (!result.ok) fatal(result.code, result.params)
    const { cu, cv, r0, r1, a0, sweep } = result.arc
    const off = Math.abs(r0 - r1)
    if (off > limits.arcTolerance) diag('warning', 'arc-end-off-circle', { diff: +off.toFixed(4), limit: limits.arcTolerance })
    const n = Math.max(4, Math.ceil((sweep / (2 * Math.PI)) * 120))
    const start = { ...pos }
    const points: Vec3[] = []
    for (let k = 0; k <= n; k++) {
      const f = k / n
      const ang = a0 + (cw ? -1 : 1) * sweep * f
      const rr = r0 + (r1 - r0) * f
      const u = cu + rr * Math.cos(ang)
      const v = cv + rr * Math.sin(ang)
      if (st.polar) points.push([u, v, start.Z + (t.pos.Z - start.Z) * f])
      else {
        const p = lerpPosition(start, t.pos, f)
        p[pl.u] = u * scaleOf(pl.u)
        p[pl.v] = v * scaleOf(pl.v)
        points.push(toWorld(p))
      }
    }
    const extra: Partial<Move> = {}
    if (inCompPlaneNow()) {
      extra.inCompPlane = true
      // G18 on a lathe: u = Z, v = X as a radius, the same plane the turning lines use
      if (turningPlane()) extra.compPlane = 'zx'
      extra.element = { type: 'arc', center: [cu, cv], radius: r0, cw, p0: [u0, v0], p1: [u1, v1], sweep } satisfies PlaneElement
    }
    Object.assign(pos, t.pos)
    checkTravel()
    if (st.polar) {
      st.px = t.px
      st.py = t.py
    }
    return pushMove('feed', points, extra)
  }

  // ---------- words ----------
  const { valueAt, parseWords } = createWordReader(ex, fatal, { integerDecimal, maxDigits: limits.maxDigits })

  function assign(s: string): void {
    ex.at(s, 0)
    const n = ex.variableNumber()
    ex.expect('=')
    const v = ex.compare()
    if (ex.pos !== s.length) {
      if (/^[A-Z]/.test(s.slice(ex.pos)) && !/^(EQ|NE|GT|GE|LT|LE|AND|OR|XOR|MOD)/.test(s.slice(ex.pos))) fatal('nc-and-macro-same-block')
      ex.fail('expression', 'unexpected text after the expression')
    }
    vars.set(n, v)
  }

  // ---------- tools ----------
  function selectTool(t: number, comment: string): void {
    if (latheControl) {
      st.tool = t >= 100 ? Math.floor(t / 100) : t
      st.offset = t >= 100 ? t % 100 : t
    } else {
      st.tool = t
      st.offset = t
    }
    if (st.offset > limits.toolOffsets) fatal('offset-number-too-large', { offset: st.offset, max: limits.toolOffsets })
    if (st.cutterComp !== 40) diag('warning', 'comp-active-at-tool-change')
    if (st.tool <= 0) return
    if (!radiusByTool.has(st.tool)) {
      const fromLibrary = tools?.tools.find((x) => x.number === st.tool)
      let r = 0
      if (fromLibrary) r = fromLibrary.diameter / 2
      else {
        const c = toolRadiusFromComment(comment)
        if (c !== null) {
          r = c
          diag('info', 'tool-radius-from-comment', { tool: st.tool, r }, st.tool)
        } else diag('warning', 'tool-radius-unknown', { tool: st.tool }, st.tool)
      }
      radiusByTool.set(st.tool, r)
      toolsUsed.push({ number: st.tool, line, name: comment, radius: r })
    }
    updateOffsets()
  }

  // ---------- block loop helpers ----------
  const findN = (n: number) => findSequence(blocks, n)
  const checkLoopId = (id: string) => {
    const n = Number(id)
    if (!(n >= 1 && n <= limits.loopIds)) fatal('macro-illegal-loop-number', { n, max: limits.loopIds })
  }
  const jumpTarget = (n: number): number => {
    if (!(n >= 1 && n <= limits.maxSequenceNumber)) fatal('goto-illegal-number', { n })
    const k = findN(n)
    if (k < 0) fatal('goto-target-missing', { n })
    return k
  }

  // ---------- one block of words ----------
  type Flow = 'jump' | 'call' | 'return' | 'end' | null
  const calls: { ret: number; count: number; start: number; macro: boolean }[] = []
  let pc = 0

  type Words = Partial<Record<string, number>>
  /** What a block's G codes ask for beyond the modal state they set. */
  interface GCommands {
    oneShot: GFn | null
    latheCycle: { fn: GFn; code: string } | null
    polarCmd: boolean | null
    polarCode: string
    skipMotion: boolean
    compCmd: 40 | 41 | 42 | null
  }

  function execWords(b: Block): Flow {
    const movesBefore = moves.length
    const cornerBefore = corner
    const { W, gs, ms, liveSpeedWord } = readWords(b)
    if (gs.includes(65) && codes.g.get(65) === 'macro-call') return callMacro(W)
    const cornerNoComma = cornerWithoutComma(gs, W)
    const g = applyGCodes(gs, W)
    applyPolar(g.polarCmd, g.polarCode)
    const flow = applyMCodes(ms, W, b, liveSpeedWord)
    applyModalWords(W, ms, b)
    applyCompCommand(g.compCmd)
    for (const ax of AXES) if (W[ax] !== undefined && !machineAxes.has(ax)) diag('warning', 'axis-not-on-machine', { axis: ax }, ax)
    if (!g.skipMotion) runMotion(g.oneShot, W)
    // Lathe multiple repetitive cycles (G70–G73, G76)
    if (g.latheCycle) {
      const cycleFlow = runLatheCycle(g.latheCycle.fn, g.latheCycle.code, W, () => targetOf(W))
      if (cycleFlow) return cycleFlow
    }
    applyCorner(movesBefore, cornerBefore, W, cornerNoComma)
    trackCompLookAhead(movesBefore)
    return flow
  }

  /** The block's words, with decimal point and range checks; G and M codes apart. */
  function readWords(b: Block): { W: Words; gs: number[]; ms: number[]; liveSpeedWord: boolean } {
    const W: Words = {}
    const gs: number[] = []
    const ms: number[] = []
    let liveSpeedWord = false
    for (const w of parseWords(b.text)) {
      if (w.value === null) continue // address with an empty variable = not programmed
      let v = w.value
      if (DIMENSION.includes(w.addr) && w.literal && !w.dot) {
        if (format.requireDecimalPoint) fatal('decimal-point-missing', { addr: w.addr })
        if (dialect.decimalPoint === 'standard') v *= 0.001
      }
      if (DIMENSION.includes(w.addr) && Math.abs(v) > limits.maxValue) fatal('data-overflow', { addr: w.addr, value: v })
      if (w.addr === 'G') gs.push(Math.round(v * 10) / 10)
      else if (w.addr === 'M') ms.push(Math.round(v))
      else if (w.addr === 'S' && w.spindle !== undefined) {
        if (w.spindle === liveSpindle) {
          if (!hasLiveTool) diag('warning', 'option-not-on-machine', { code: `S${w.spindle}=` }, line)
          W['S2'] = v
          liveSpeedWord = true
        } else W['S'] = v
      } else if (w.addr === ',C' || w.addr === ',R') W[w.addr] = v
      else if (w.addr.startsWith(',')) diag('warning', 'direct-corner-not-simulated', { word: w.addr }, line)
      else W[w.addr] = v
    }
    return { W, gs, ms, liveSpeedWord }
  }

  /** G65 P n: a macro call with arguments as local variables. */
  function callMacro(W: Words): Flow {
    const o = W['P']
    if (o === undefined) fatal('subprogram-p-missing', { code: 'G65' })
    const bad = Object.keys(W).find((k) => k === 'G' || k === 'N' || k === 'O')
    if (bad) fatal('g65-illegal-argument', { addr: bad })
    const start = programs.get(o)
    if (start === undefined) fatal('subprogram-missing', { o })
    if (calls.filter((c) => c.macro).length >= limits.macroNesting) fatal('macro-nesting', { max: limits.macroNesting })
    const loc = new Map<number, Value>()
    for (const [k, val] of Object.entries(W)) {
      const n = G65_ARGS[k]
      if (n !== undefined && k !== 'P' && k !== 'L' && val !== undefined) loc.set(n, val)
    }
    locals.push(loc)
    calls.push({ ret: pc + 1, count: W['L'] ?? 1, start: start + 1, macro: true })
    pc = start + 1
    return 'jump'
  }

  // Lathes with the chamfer/corner R option without comma: C or R in a one-axis G01 block.
  // Machines with a C axis use ",C" (C alone is the axis), as on the control.
  function cornerWithoutComma(gs: number[], W: Words): boolean {
    let cornerNoComma = false
    if (dialect.cornerWithoutComma && lathe && !machineAxes.has('C')) {
      const motion = gs.map((g) => codes.g.get(g)).filter((f) => f === 'rapid' || f === 'linear' || f === 'arc-cw' || f === 'arc-ccw')
      const linearNow = motion.length ? motion[motion.length - 1] === 'linear' : st.motion === 1
      const given = (ax: Axis) => W[ax] !== undefined || [...incremental].some(([a, x]) => x === ax && W[a] !== undefined)
      if (linearNow && given('X') !== given('Z')) {
        if (W['C'] !== undefined && W[',C'] === undefined) {
          W[',C'] = W['C']
          delete W['C']
          cornerNoComma = true
        }
        if (W['R'] !== undefined && W[',R'] === undefined) {
          W[',R'] = W['R']
          delete W['R']
          cornerNoComma = true
        }
      }
    }
    return cornerNoComma
  }

  function applyGCodes(gs: number[], W: Words): GCommands {
    let oneShot: GFn | null = null
    let latheCycle: { fn: GFn; code: string } | null = null
    let polarCmd: boolean | null = null
    let polarCode = 'G12.1'
    let skipMotion = false
    let compCmd: 40 | 41 | 42 | null = null
    const fns: [GFn, string][] = []
    for (const g of gs) {
      const fn = codes.g.get(g)
      const code = formatCode('G', g)
      if (!fn) diag('warning', 'unknown-g-code', { code }, code)
      else fns.push([fn, code])
    }
    // G codes the control refuses while polar interpolation is on
    if (st.polar && !fns.some(([fn]) => fn === 'polar-off')) {
      for (const [fn, code] of fns) {
        if (fn === 'rapid') diag('warning', 'rapid-in-polar', { code }, line)
        else if (fn === 'machine-coords') diag('alarm', 'machine-coords-in-polar', { code })
        else if (!POLAR_ALLOWED.has(fn)) diag('warning', 'improper-g-in-polar', { code }, line)
      }
    }
    for (const [fn, code] of fns) {
      switch (fn) {
        case 'rapid':
          st.motion = 0
          st.cycle = null
          st.single = null
          st.threading = false
          break
        case 'linear':
          st.motion = 1
          st.cycle = null
          st.single = null
          st.threading = false
          break
        case 'arc-cw':
          st.motion = 2
          st.cycle = null
          st.single = null
          st.threading = false
          break
        case 'arc-ccw':
          st.motion = 3
          st.cycle = null
          st.single = null
          st.threading = false
          break
        case 'dwell':
        case 'reference-return':
        case 'machine-coords':
        case 'face-peck-cycle':
        case 'groove-cycle':
          oneShot = fn
          break
        case 'plane-xy':
        case 'plane-zx':
        case 'plane-yz': {
          const plane = fn === 'plane-xy' ? 17 : fn === 'plane-zx' ? 18 : 19
          if (plane !== st.plane && st.cutterComp !== 40) fatal('comp-plane-change', { code })
          st.plane = plane
          break
        }
        case 'inch':
          diag('warning', 'inch-not-converted', undefined, 'inch')
          break
        case 'polar-on':
          polarCmd = true
          polarCode = code
          break
        case 'polar-off':
          polarCmd = false
          break
        case 'cutter-comp-cancel':
          compCmd = 40
          break
        case 'cutter-comp-left':
          compCmd = 41
          break
        case 'cutter-comp-right':
          compCmd = 42
          break
        case 'absolute':
          st.absolute = true
          break
        case 'incremental':
          st.absolute = false
          break
        case 'feed-per-minute':
          st.feedPerMinute = true
          break
        case 'feed-per-rev':
          st.feedPerMinute = false
          break
        case 'constant-surface-speed':
          diag('info', 'css-not-simulated', undefined, 'css')
          break
        case 'set-origin':
          if (W['S'] !== undefined) delete W['S'] // max spindle speed
          else if (AXES.some((ax) => W[ax] !== undefined)) {
            diag('warning', 'set-origin-not-simulated', { code })
            skipMotion = true
          }
          break
        case 'drill':
        case 'peck-drill':
        case 'tap':
        case 'bore':
        case 'radial-drill':
        case 'radial-tap': {
          const radial = fn.startsWith('radial')
          st.cycle = { fn, code, initial: radial ? pos.X : pos.Z }
          if (W['Q'] !== undefined) st.cycle.q = W['Q']
          break
        }
        case 'canned-cycle-cancel':
          st.cycle = null
          break
        case 'return-initial':
          st.returnToR = false
          break
        case 'return-r':
          st.returnToR = true
          break
        case 'finishing-cycle':
        case 'roughing-cycle':
        case 'rough-turn-cycle':
        case 'rough-face-cycle':
        case 'pattern-cycle':
        case 'thread-multi-cycle': {
          // G70 needs P and Q; the second block of G71–G73 has P and Q too
          const p = W['P']
          const q = W['Q']
          if (fn !== 'thread-multi-cycle' && (fn === 'finishing-cycle' || p !== undefined || q !== undefined)) {
            if (p === undefined || q === undefined) fatal('cycle-pq-missing', { code })
            for (const n of [p, q]) if (findN(n) < 0) fatal('cycle-sequence-missing', { code, n })
          }
          // Run after F, S and T of the block are taken (below), with the cycle's own moves
          latheCycle = { fn, code }
          skipMotion = true
          break
        }
        case 'turning-cycle':
          st.single = 'turn'
          st.singleEnd = null
          st.cycle = null
          break
        case 'facing-cycle':
          st.single = 'face'
          st.singleEnd = null
          st.cycle = null
          break
        case 'threading-cycle':
          st.single = 'thread'
          st.singleEnd = null
          st.cycle = null
          break
        case 'thread-cut':
          st.motion = 1
          st.threading = true
          st.cycle = null
          st.single = null
          break
        case 'cylindrical':
        case 'macro-modal':
          diag('warning', 'cycle-not-simulated', { code }, code)
          skipMotion = true
          break
        case 'polar-coords-on':
        case 'mirror-on':
        case 'rotation-on':
        case 'local-coords':
        case 'circle-cutting':
        case 'not-simulated':
          // Accepted by the control, not drawn yet: the path after it would be wrong, so say so
          diag('warning', 'function-not-simulated', { code }, code)
          if (fn !== 'polar-coords-on') skipMotion = true // their axis words are data, not a move
          break
        case 'polar-coords-off':
        case 'mirror-off':
        case 'rotation-off':
        case 'macro-call':
        case 'work-offset': {
          // In a G10 block (Haas: G10 L20 G154 P n) the code only names the offset being written
          if (fns.some(([f]) => f === 'data-setting')) break
          // G54.1 P n (Haas also G154 P n, and G110–G129 for P1–P20) selects an additional offset
          const haasFixed = /^G1[12]\d$/.test(code) ? Number(code.slice(1)) - 109 : null
          const extra = code === 'G54.1' || code === 'G154'
          const name = haasFixed !== null ? `G54.1 P${haasFixed}` : extra ? `G54.1 P${W['P'] ?? 1}` : code
          if (extra) delete W['P']
          st.workOffset = name
          shift = shiftOf(name)
          if (configuredOffsets && !table.has(name)) diag('info', 'work-offset-not-set', { name }, name)
          break
        }
        case 'data-setting':
          dataSetting(code, W)
          skipMotion = true
          break
        case 'tool-length-comp': {
          // G43/G44 H n: H0 (or none) is offset 0, which holds nothing
          st.lengthComp = Math.round(W['H'] ?? 0)
          updateOffsets()
          const e = offsetOf(st.lengthComp)
          const value = (e.length ?? 0) + (e.lengthWear ?? 0)
          const actual = gaugeOf(st.tool)
          if (st.tool > 0 && actual !== undefined && Math.abs(value - actual) > 0.01)
            diag('warning', 'length-offset-mismatch', {
              h: st.lengthComp,
              value: Math.round(value * 1000) / 1000,
              tool: st.tool,
              actual: Math.round(actual * 1000) / 1000,
              diff: Math.round((value - actual) * 1000) / 1000
            })
          break
        }
        case 'tool-length-comp-cancel':
          st.lengthComp = null
          updateOffsets()
          break
        case 'macro-modal-cancel':
        case 'constant-rpm':
        case 'other':
          break
      }
    }
    return { oneShot, latheCycle, polarCmd, polarCode, skipMotion, compCmd }
  }

  /** G12.1 / G13.1: polar coordinate interpolation on and off. */
  function applyPolar(polarCmd: boolean | null, polarCode: string): void {
    if (polarCmd === true) {
      // A lathe without C (or a mill) does not have polar interpolation: the control refuses the G code
      if (!lathe || !machineAxes.has('C')) diag('warning', 'option-not-on-machine', { code: polarCode }, 'polar')
      else {
        if (st.cutterComp !== 40) diag('alarm', 'comp-active-at-polar-on')
        if (st.polar) diag('warning', 'polar-already-on')
        const w = latheWorld(pos.X, pos.C, pos.Y, pos.Z)
        st.px = w[0]
        st.py = w[1]
        st.polar = true
        if (rules.has('c-axis-requires-enable') && !st.cAxisEnabled) diag('warning', 'polar-without-c-axis', undefined, 'polar-c')
        if (rules.has('no-brake-in-polar') && st.brake) diag('warning', 'brake-in-polar', undefined, line)
      }
    }
    if (polarCmd === false && st.polar) {
      if (st.cutterComp !== 40) diag('alarm', 'comp-active-at-polar-off')
      let a = Math.atan2(st.py, st.px) / D2R
      while (a - pos.C > 180) a -= 360
      while (pos.C - a > 180) a += 360
      pos.X = Math.hypot(st.px, st.py) * xDia
      pos.C = a
      pos.Y = 0
      st.polar = false
    }
  }

  function applyMCodes(ms: number[], W: Words, b: Block, liveSpeedWord: boolean): Flow {
    let flow: Flow = null
    // ---- M codes ----
    for (const mNum of ms) {
      const fn = codes.m.get(mNum)
      const code = formatCode('M', mNum)
      if (!fn) {
        diag('warning', 'unknown-m-code', { code }, code)
        continue
      }
      switch (fn) {
        case 'spindle-cw':
        case 'spindle-ccw':
          // With a live-tool speed in the block (e.g. S2=), M3/M4 drive the live tool
          if (liveSpeedWord || (st.lastSpeedWasLive && W['S'] === undefined)) st.liveToolOn = true
          else st.spindleOn = true
          break
        case 'live-tool-cw':
        case 'live-tool-ccw':
          st.liveToolOn = true
          break
        case 'live-tool-stop':
          st.liveToolOn = false
          break
        case 'spindle-stop':
          st.spindleOn = false
          st.liveToolOn = false
          st.brake = false
          break
        case 'c-axis-on':
          st.cAxisEnabled = true
          break
        case 'c-axis-off':
          st.cAxisEnabled = false
          break
        case 'brake-on':
          st.brake = true
          if (rules.has('no-brake-in-polar') && st.polar) diag('warning', 'brake-in-polar', undefined, line)
          break
        case 'brake-off':
          st.brake = false
          break
        case 'tailstock-advance':
          st.tailstock = true
          break
        case 'tailstock-retract':
          st.tailstock = false
          break
        case 'tool-change':
          // "T5 M06" in one block is handled with the T word below
          if (st.pendingTool && W['T'] === undefined) selectTool(st.pendingTool.t, st.pendingTool.comment || b.comment)
          break
        case 'subprogram-call': {
          const p = W['P']
          if (p === undefined) fatal('subprogram-p-missing', { code })
          let prog = p
          let count = W['L'] ?? 1
          if (p >= 10000 && W['L'] === undefined) {
            prog = p % 10000
            count = Math.floor(p / 10000)
          }
          const start = programs.get(prog)
          if (start === undefined) fatal('subprogram-missing', { o: prog })
          if (calls.filter((c) => !c.macro).length >= limits.subprogramNesting) fatal('subprogram-nesting', { max: limits.subprogramNesting })
          calls.push({ ret: pc + 1, count, start: start + 1, macro: false })
          flow = 'call'
          break
        }
        case 'local-subprogram-call': {
          // M97 P n: the subprogram starts at block N n of this program and ends with M99
          const n = W['P']
          if (n === undefined) fatal('subprogram-p-missing', { code })
          const start = findN(n)
          if (start < 0) fatal('goto-target-missing', { n })
          if (calls.filter((c) => !c.macro).length >= limits.subprogramNesting) fatal('subprogram-nesting', { max: limits.subprogramNesting })
          calls.push({ ret: pc + 1, count: W['L'] ?? 1, start, macro: false })
          flow = 'call'
          break
        }
        case 'subprogram-return':
          flow = 'return'
          break
        case 'end':
        case 'end-rewind':
          flow = 'end'
          break
        case 'stop':
          diag('info', 'program-stop', { code })
          break
        case 'optional-stop':
          diag('info', 'optional-stop', { code })
          break
        case 'coolant-on':
        case 'coolant-off':
        case 'other':
          break
      }
    }
    return flow
  }

  /** S, F, D, H and T words: speeds, feed, offsets and the tool. */
  function applyModalWords(W: Words, ms: number[], b: Block): void {
    if (W['S'] !== undefined) {
      st.spindleSpeed = W['S']
      st.lastSpeedWasLive = false
    }
    if (W['S2'] !== undefined) {
      st.liveToolSpeed = W['S2']
      st.lastSpeedWasLive = true
    }
    if (W['F'] !== undefined) st.feed = W['F']
    for (const k of ['D', 'H'] as const) {
      const v = W[k]
      if (v !== undefined && !latheControl && v > limits.toolOffsets) fatal('offset-number-too-large', { offset: v, max: limits.toolOffsets })
    }
    if (W['D'] !== undefined && !latheControl) st.dNumber = Math.round(W['D'])
    if (W['T'] !== undefined) {
      const t = Math.round(W['T'])
      if (latheControl) selectTool(t, b.comment)
      else {
        st.pendingTool = { t, comment: b.comment }
        if (ms.some((m) => codes.m.get(m) === 'tool-change')) selectTool(t, b.comment)
      }
    }
  }

  /** G40/G41/G42: compensation starts or ends with the next move in the plane. */
  function applyCompCommand(compCmd: 40 | 41 | 42 | null): void {
    if (compCmd !== null) {
      if (compCmd !== 40 && st.cutterComp === 40) st.compStartPending = compCmd
      else if (compCmd === 40 && st.cutterComp !== 40) st.compCancelPending = true
      else if (compCmd !== 40 && compCmd !== st.cutterComp) {
        diag('warning', 'comp-switch-without-g40')
        st.cutterComp = compCmd
      }
    }
  }

  /** The end point of a move block: the axis words in G90/G91, with U V W… incremental. */
  function targetOf(W: Words): Target {
    const t: Target = { pos: { ...pos }, px: st.px, py: st.py }
    for (const ax of AXES) {
      const w = W[ax]
      if (w === undefined) continue
      if (st.polar && ax === 'X') t.px = st.absolute ? w / xDia : st.px + w / xDia
      else if (st.polar && ax === 'C') t.py = st.absolute ? w : st.py + w
      else t.pos[ax] = st.absolute ? w + shift[ax] : pos[ax] + w
    }
    for (const [addr, ax] of incremental) {
      const w = W[addr]
      if (w === undefined) continue
      if (st.polar && ax === 'X') t.px = st.px + w / xDia
      else if (st.polar && ax === 'C') t.py = st.py + w
      else t.pos[ax] += w
    }
    return t
  }
  /** The current point with some axes replaced (machine-coordinate moves, cycles). */
  const atPos = (p: Partial<Position>): Target => ({ pos: { ...pos, ...p }, px: st.px, py: st.py })

  /** The block's move: a one-shot code, a cycle, or the modal G00–G03. */
  function runMotion(oneShot: GFn | null, W: Words): void {
    const has = (k: string) => W[k] !== undefined
    const axisWords = AXES.some((ax) => has(ax)) || [...incremental.keys()].some((k) => has(k))
    if (oneShot === 'dwell') {
      const s = has('P') ? (W['P'] ?? 0) / 1000 : (W['X'] ?? W['U'] ?? 0)
      pushMove('dwell', [worldNow(), worldNow()], {}, s)
    } else if (oneShot === 'machine-coords') {
      const p: Partial<Position> = {}
      for (const ax of AXES) {
        const w = W[ax]
        // The gauge line (or turret) goes to the machine position: the tip is the offset below it
        if (w !== undefined) p[ax] = machineZero[ax] + w - extraOf(ax)
      }
      linear('rapid', atPos(p))
    } else if (oneShot === 'reference-return') {
      if (!st.polar) linear('rapid', targetOf(W))
      const p: Partial<Position> = {}
      for (const ax of AXES) {
        const inc = [...incremental].find(([, a]) => a === ax)?.[0]
        if (!has(ax) && !(inc && has(inc))) continue
        p[ax] = ax === 'C' || ax === 'A' || ax === 'B' ? 0 : machineZero[ax] - extraOf(ax)
        if (ax === 'C') st.cAxisEnabled = true
      }
      linear('rapid', atPos(p))
    } else if (oneShot === 'face-peck-cycle' || oneShot === 'groove-cycle') {
      if (axisWords) {
        const t = targetOf(W)
        const back = oneShot === 'face-peck-cycle' ? { Z: pos.Z } : { X: pos.X }
        linear('feed', atPos({ X: t.pos.X, Z: t.pos.Z }))
        linear('rapid', atPos(back))
        diag('info', 'cycle-simplified', { code: oneShot === 'face-peck-cycle' ? 'face-peck' : 'groove' }, oneShot)
      }
    } else if (st.single && axisWords) {
      const t = targetOf(W)
      const given = (ax: Axis) => has(ax) || [...incremental].some(([a, x]) => x === ax && has(a))
      // X or Z left out of a repeat block (e.g. just "X42.") keeps the cycle's last end point
      const prev = st.singleEnd ?? here()
      const end = { x: given('X') ? t.pos.X / xDia : prev.x, z: given('Z') ? t.pos.Z : prev.z }
      st.singleEnd = end
      // R is the cone: radius difference in X (turning, threading) or in Z (facing)
      runSteps(singleCycle(st.single, here(), end, W['R'] ?? 0))
    } else if (st.cycle && axisWords) {
      runCycle(st.cycle, W, targetOf(W))
    } else if (axisWords) {
      const t = targetOf(W)
      const cMoves = !st.polar && Math.abs(t.pos.C - pos.C) > 1e-9
      if (cMoves && st.motion === 0) st.brake = false // a rapid C move releases the brake
      if (cMoves && lathe && rules.has('c-axis-requires-enable') && !st.cAxisEnabled) diag('warning', 'c-axis-not-enabled', undefined, 'c')
      if (st.polar && st.motion === 0) diag('warning', 'rapid-in-polar', { code: 'G00' }, line)
      const cs = st.compStartPending
      const cc = st.compCancelPending
      if ((cs || cc) && (st.motion === 2 || st.motion === 3)) fatal('comp-start-on-arc')
      const inPlane = inCompPlaneNow()
      let m: Move | null
      if (st.motion === 0) m = linear('rapid', t)
      else if (st.motion === 1) m = st.threading ? asThread(() => linear('feed', t)) : linear('feed', t)
      else {
        // only the plane axes (and the helix axis) may move on an arc
        const pl = PLANES[st.plane]
        const allowed = st.polar ? ['X', 'C', 'Z'] : [pl.u, pl.v, pl.helix]
        const stray = AXES.find((ax) => has(ax) && !allowed.includes(ax))
        if (stray) fatal('arc-plane-axis', { axis: stray, plane: `G${st.plane}` })
        const aw: Partial<Record<string, number>> = {}
        for (const k of ['R', 'I', 'J', 'K']) if (has(k)) aw[k] = W[k]
        m = arc(st.motion === 2, t, aw)
      }
      if (m && inPlane && st.motion !== 0 && (cs || cc)) {
        if (cs) {
          m.compStart = cs
          st.cutterComp = cs
          m.state = { ...m.state, cutterComp: cs }
        } else {
          m.compCancel = true
          st.cutterComp = 40
        }
      } else {
        if (cs) st.cutterComp = cs
        if (cc) st.cutterComp = 40
      }
      st.compStartPending = null
      st.compCancelPending = false
      if (
        m?.kind === 'feed' &&
        pos.Z < -1e-6 &&
        lathe &&
        rules.has('live-tool-on-while-cutting') &&
        !st.liveToolOn &&
        (st.polar || st.cAxisEnabled)
      )
        diag('warning', 'live-tool-off-while-cutting', { tool: st.tool }, st.tool)
    }
  }

  /** Chamfer / corner R (",C" ",R", or C/R without comma on lathes that allow it). */
  function applyCorner(movesBefore: number, cornerBefore: Corner | null, W: Words, cornerNoComma: boolean): void {
    const made = moves.slice(movesBefore)
    if (cornerBefore) {
      corner = null
      const next = made[0]
      if (!next || next.kind === 'dwell') fatal('corner-without-move')
      if (next.kind === 'rapid') fatal('corner-next-not-linear')
      makeCorner(cornerBefore, next)
    }
    const cWord = W[',C']
    const rWord = W[',R']
    if (cWord !== undefined || rWord !== undefined) {
      if (cWord !== undefined && rWord !== undefined) fatal('corner-both')
      const m = made[made.length - 1]
      if (!m || m.kind !== 'feed') fatal('corner-next-not-linear')
      corner = { kind: cWord !== undefined ? 'C' : 'R', size: cWord ?? rWord ?? 0, move: m, perpendicular: cornerNoComma }
    }
  }

  /** Cutter compensation looks ahead along the plane; blocks without movement there blind it. */
  function trackCompLookAhead(movesBefore: number): void {
    if (st.cutterComp !== 40 && inCompPlaneNow()) {
      const planeMoved = moves.slice(movesBefore).some((m) => m.element)
      st.compNoMove = planeMoved ? 0 : st.compNoMove + 1
      if (st.compNoMove > limits.compNoMoveBlocks) diag('warning', 'comp-no-move-blocks', { count: st.compNoMove, max: limits.compNoMoveBlocks })
    } else st.compNoMove = 0
  }

  // ---------- lathe cycles ----------
  /** Set while a thread is being cut: its moves are marked, the feed override does not apply to them. */
  let threadMove = false
  /** Where the tool is, as a lathe point (radius, Z). */
  const here = (): P2 => ({ x: pos.X / xDia, z: pos.Z })

  /** Thread cutting: F is the lead, fed per revolution whatever G94/G95 says. */
  function asThread<T>(f: () => T): T {
    const saved = st.feedPerMinute
    st.feedPerMinute = false
    threadMove = true
    try {
      return f()
    } finally {
      st.feedPerMinute = saved
      threadMove = false
    }
  }

  /** A cycle's passes as moves: rapids, cutting feed, and threads at the lead per revolution. */
  function runSteps(steps: Step[]): void {
    for (const s of steps) {
      const t: Target = { pos: { ...pos, X: s.to.x * xDia, Z: s.to.z }, px: st.px, py: st.py }
      if (s.kind === 'thread') asThread(() => linear('feed', t))
      else linear(s.kind, t)
    }
  }

  /** Runs blocks from..to for real (G70 finishing along the contour). */
  function runBlocks(from: number, to: number): void {
    const saved = line
    for (let k = from; k <= to; k++) {
      const b = blocks[k]
      if (!isNcBlock(b)) continue
      line = b.line
      execWords(b)
    }
    line = saved
  }

  /**
   * The finishing contour P–Q as points (radius, Z): its blocks are run silently, their moves read
   * and thrown away, and the machine state put back, as the control reads the shape program.
   */
  function readContour(from: number, to: number, code: string): P2[] {
    if (!/(^|[^\d.])G0*[01](?![\d.])/i.test(blocks[from]?.text ?? '')) fatal('cycle-contour-first-block', { code })
    const saved = { pos: { ...pos }, st: { ...st }, shift: { ...shift }, line, corner, count: moves.length }
    let captured: Move[] = []
    let ok = true
    quiet++
    try {
      for (let k = from; k <= to; k++) {
        const b = blocks[k]
        if (!isNcBlock(b)) continue
        line = b.line
        execWords(b)
      }
      captured = moves.slice(saved.count)
    } catch (e) {
      if (!(e instanceof Stop)) throw e
      ok = false
    } finally {
      quiet--
      moves.length = saved.count
      Object.assign(pos, saved.pos)
      Object.assign(st, saved.st)
      shift = saved.shift
      line = saved.line
      corner = saved.corner
    }
    const points = captured.flatMap((m) => m.points.slice(1).map((q) => ({ x: q[0], z: q[2] })))
    if (!ok || points.length < 2) fatal('cycle-contour-invalid', { code })
    return points
  }

  /** P and Q of G76 are in µm without a decimal point (as the control reads them), in mm with one. */
  const microns = (v: number) => (Number.isInteger(v) ? v / 1000 : v)

  /**
   * G70–G73 and G76. First blocks (no P/Q, or no end point for G76) only set the parameters; the second
   * block runs the cycle. The contour blocks right after G71–G73 are run by G70, not now.
   */
  function runLatheCycle(fn: GFn, code: string, W: Partial<Record<string, number>>, target: () => Target): Flow {
    const P = W['P']
    const Q = W['Q']
    if (fn === 'thread-multi-cycle') {
      const ends = AXES.some((ax) => W[ax] !== undefined) || [...incremental.keys()].some((k) => W[k] !== undefined)
      if (!ends) {
        // P m r a: finishing passes, chamfer, tool angle; Q smallest depth; R finishing allowance
        if (P !== undefined) st.thread = { ...st.thread, repeats: Math.floor(P / 10000) % 100 || 1 }
        if (Q !== undefined) st.thread = { ...st.thread, minDepth: microns(Q) }
        if (W['R'] !== undefined) st.thread = { ...st.thread, finish: W['R'] }
        return null
      }
      const height = P !== undefined ? microns(P) : 0
      const first = Q !== undefined ? microns(Q) : 0
      if (!(height > 0) || !(first > 0)) fatal('cycle-depth-invalid', { code })
      const t = target()
      runSteps(threadPasses(here(), { x: t.pos.X / xDia, z: t.pos.Z }, { ...st.thread, height, firstDepth: first, taper: W['R'] ?? 0 }))
      return null
    }

    const kind = fn === 'rough-face-cycle' ? 'face' : fn === 'pattern-cycle' ? 'pattern' : fn === 'finishing-cycle' ? 'finish' : 'turn'
    if (P === undefined || Q === undefined) {
      // First block: depth and retract (G71 U R, G72 W R) or relief and passes (G73 U W R)
      if (kind === 'turn') st.roughTurn = { depth: W['U'] ?? st.roughTurn.depth, retract: W['R'] ?? st.roughTurn.retract }
      else if (kind === 'face') st.roughFace = { depth: W['W'] ?? st.roughFace.depth, retract: W['R'] ?? st.roughFace.retract }
      else if (kind === 'pattern') st.pattern = { reliefX: W['U'] ?? st.pattern.reliefX, reliefZ: W['W'] ?? st.pattern.reliefZ, count: W['R'] ?? st.pattern.count }
      return null
    }
    const ns = findN(P)
    const nf = findN(Q)
    const start = here()
    if (kind === 'finish') {
      // G70: the contour blocks with their own F and S, then back to the start point
      runBlocks(ns, nf)
      runSteps([{ kind: 'rapid', to: start }])
      return null
    }
    const contour = readContour(ns, nf, code)
    // U is the finishing allowance in X as programmed (a diameter on lathes), W in Z
    const finishX = (W['U'] ?? 0) / xDia
    const finishZ = W['W'] ?? 0
    if (kind === 'turn') {
      if (!(st.roughTurn.depth > 0)) fatal('cycle-depth-invalid', { code })
      // Type I: the shape only moves away from the face in Z
      if (contour.some((q, i) => i > 0 && q.z > (contour[i - 1]?.z ?? q.z) + 1e-6)) fatal('cycle-contour-not-monotonic', { code })
      runSteps(roughTurn(start, contour, { ...st.roughTurn, finishX, finishZ }))
    } else if (kind === 'face') {
      if (!(st.roughFace.depth > 0)) fatal('cycle-depth-invalid', { code })
      runSteps(roughFace(start, contour, { ...st.roughFace, finishX, finishZ }))
    } else {
      if (!(st.pattern.count >= 1)) fatal('cycle-depth-invalid', { code })
      runSteps(patternRepeat(start, contour, { ...st.pattern, finishX, finishZ }))
    }
    // The shape program right after the cycle is skipped: G70 runs it
    if (nf > pc) {
      pc = nf + 1
      return 'jump'
    }
    return null
  }

  /** Chamfer or corner R between the corner block's line and the next line (see corner.ts). */
  function makeCorner(c: Corner, next: Move): void {
    const r = cutCorner(c, next)
    if (r.kind === 'not-simulated') diag('warning', 'direct-corner-not-simulated', { word: `,${c.kind}` }, `corner-arc|${line}`)
    else if (r.kind === 'error') fatal(r.code, r.params)
    else if (r.kind === 'cut') {
      Object.assign(c.move, r.prev)
      Object.assign(next, r.next)
      moves.splice(moves.indexOf(next), 0, r.corner)
    }
  }

  /** G10: tool offsets, or work offsets G54–G59 and G54.1 P n (see dataSetting.ts). */
  function dataSetting(code: string, W: Partial<Record<string, number>>): void {
    const L = W['L']
    const P = W['P']
    const name = workOffsetName(L, P)
    if (!name) {
      const tool = toolOffsetSetting(offsetOf, L, P, W, { lathe: latheControl, absolute: st.absolute })
      if (tool) {
        offsetTable.set(tool.n, tool.entry)
        updateOffsets()
        const values = Object.entries(tool.entry)
          .map(([k, v]) => `${k} ${v}`)
          .join(', ')
        diag('info', 'tool-offset-set', { n: tool.n, values })
        return
      }
      // L2 P0 (external shift) and other data are not drawn
      diag('warning', 'function-not-simulated', { code: `${code} L${L ?? '-'} P${P ?? '-'}` }, `g10:${L}:${P}`)
      return
    }
    const o = writeWorkOffset(table.get(name) ?? {}, W, st.absolute, incremental)
    table.set(name, o)
    if (name === st.workOffset) shift = shiftOf(name)
    const values = AXES.filter((ax) => o[ax] !== undefined)
      .map((ax) => `${ax}${o[ax] ?? 0}`)
      .join(' ')
    diag('info', 'work-offset-set', { name, values })
  }

  function runCycle(cy: Cycle, W: Partial<Record<string, number>>, t: Target): void {
    if (st.cutterComp !== 40) diag('warning', 'cycle-in-comp', { code: cy.code }, line)
    if (cy.fn === 'peck-drill' && !latheControl && !((W['Q'] ?? cy.q ?? 0) > 0)) fatal('peck-q-missing', { code: cy.code })
    if (W['Q'] !== undefined) cy.q = W['Q']
    const radial = cy.fn.startsWith('radial')
    const depthAxis: Axis = radial ? 'X' : 'Z'
    if (W[depthAxis] !== undefined) cy.depth = t.pos[depthAxis]
    const depth = cy.depth ?? pos[depthAxis]
    const rWord = W['R']
    if (rWord !== undefined) {
      // Fanuc lathe: R is the distance from the initial level; mill in G90: absolute level
      cy.r = latheControl || !st.absolute ? cy.initial + rWord : rWord + shift[depthAxis]
    }
    const position: Partial<Position> = {}
    for (const ax of AXES) if (ax !== depthAxis) position[ax] = t.pos[ax]
    linear('rapid', atPos(position))
    if (cy.r !== undefined) linear('rapid', atPos({ [depthAxis]: cy.r }))
    linear('feed', atPos({ [depthAxis]: depth }))
    linear('rapid', atPos({ [depthAxis]: st.returnToR && cy.r !== undefined ? cy.r : cy.initial }))
    if (lathe && rules.has('live-tool-on-while-cutting') && !st.liveToolOn) diag('warning', 'drill-with-live-tool-off', undefined, line)
  }

  /** Macro statements: #n = …, IF, WHILE … DO, DO, END, GOTO. Sets pc and returns true when the block was one. */
  function runMacroStatement(s: string): boolean {
    if (s.startsWith('#')) {
      assign(s)
      pc++
      return true
    }
    if (s.startsWith('IF[')) {
      ex.at(s, 2)
      const c = ex.bracket()
      const rest = s.slice(ex.pos)
      if (rest.startsWith('GOTO')) {
        const n = Math.round(valueAt(rest, 4, 'GOTO').v ?? 0)
        if ((c ?? 0) !== 0) {
          pc = jumpTarget(n)
          return true
        }
      } else if (rest.startsWith('THEN')) {
        if ((c ?? 0) !== 0) {
          const r2 = rest.slice(4)
          if (!r2.startsWith('#')) ex.fail('format', 'THEN only accepts a variable assignment')
          assign(r2)
        }
      } else ex.fail('format', 'IF without GOTO or THEN')
      pc++
      return true
    }
    if (s.startsWith('WHILE[')) {
      ex.at(s, 5)
      const c = ex.bracket()
      const dm = /^DO(\d+)$/.exec(s.slice(ex.pos))
      if (!dm?.[1]) ex.fail('format', 'WHILE without DOn')
      checkLoopId(dm[1])
      // The control checks the matching END when it runs the WHILE, whatever the condition
      const k = findLoopEnd(blocks, pc, dm[1])
      if (k < 0) fatal('macro-missing-end', { n: dm[1] })
      pc = (c ?? 0) !== 0 ? pc + 1 : k + 1
      return true
    }
    const doM = /^DO(\d+)$/.exec(s)
    if (doM?.[1]) {
      checkLoopId(doM[1])
      pc++
      return true
    }
    const endM = /^END(\d+)$/.exec(s)
    if (endM?.[1]) {
      checkLoopId(endM[1])
      const k = findLoopStart(blocks, pc, endM[1])
      if (k < 0) fatal('macro-missing-end', { n: endM[1] })
      pc = k
      return true
    }
    if (s.startsWith('GOTO')) {
      pc = jumpTarget(Math.round(valueAt(s, 4, 'GOTO').v ?? 0))
      return true
    }
    return false
  }

  // ---------- run ----------
  let finished = false
  let steps = 0
  const mainStart = blocks.findIndex((b) => b.programNumber !== undefined)
  if (mainStart >= 0) pc = mainStart + 1

  try {
    // Load checks: what the control verifies when the file comes in
    for (const issue of loadIssues(layout, blocks, format)) {
      line = issue.line
      diag(issue.severity, issue.code, issue.params, undefined, true)
    }
    const badNumber = illegalProgramNumber(blocks, limits.maxProgramNumber)
    if (badNumber) {
      line = badNumber.line
      fatal('illegal-program-number', { o: badNumber.programNumber ?? 0, max: limits.maxProgramNumber })
    }

    while (pc < blocks.length) {
      if (++steps > maxBlocks) fatal('endless-loop', { max: maxBlocks })
      const b = blocks[pc] as Block
      line = b.line
      if (b.programNumber !== undefined) {
        if (calls.length === 0 && pc !== mainStart) {
          diag('info', 'main-ended-without-m30')
          break
        }
        pc++
        continue
      }
      if ((b.blockDelete && opt.blockDelete) || !b.text) {
        pc++
        continue
      }
      const s = b.text
      if (dialect.macro === 'none' && usesMacro(s)) diag('warning', 'macro-not-in-dialect', undefined, 'macro')
      try {
        if (runMacroStatement(s)) continue
        const flow = execWords(b)
        if (flow === 'jump') continue
        if (flow === 'end') {
          finished = true
          break
        }
        if (flow === 'call') {
          pc = calls[calls.length - 1]?.start ?? pc + 1
          continue
        }
        if (flow === 'return') {
          const c = calls[calls.length - 1]
          if (!c) {
            diag('info', 'm99-in-main')
            finished = true
            break
          }
          if (--c.count > 0) {
            pc = c.start
            continue
          }
          calls.pop()
          if (c.macro) locals.pop()
          pc = c.ret
          continue
        }
        pc++
      } catch (e) {
        if (e instanceof MacroError) fatal(MACRO_ERROR_CODE[e.kind], { detail: e.detail })
        throw e
      }
    }
    // Set inside execWords, which the compiler's narrowing does not follow
    const pendingCorner = corner as Corner | null
    if (pendingCorner) {
      // The program ended right after a chamfer or corner R block
      line = pendingCorner.move.line
      fatal('corner-without-move')
    }
    if (pc >= blocks.length && !finished) {
      // Reaching the end of record (%) without M30/M02/M99
      line = layout.endLine
      diag('warning', 'no-program-end')
    }
    if (st.cutterComp !== 40) diag('warning', 'ended-with-comp')
    if (st.polar) diag('warning', 'ended-in-polar')
  } catch (e) {
    if (e instanceof MacroAlarm) {
      const comment = blocks[pc]?.comment ?? ''
      try {
        diag('alarm', 'macro-alarm', { num: e.num, comment })
      } catch {
        // the alarm stops the run, which is what happens here anyway
      }
      stoppedBy ??= diagnostics[diagnostics.length - 1]
    } else if (!(e instanceof Stop)) {
      try {
        diag('alarm', 'syntax-error', { detail: e instanceof Error ? e.message : String(e) })
      } catch {
        // already stopping
      }
      stoppedBy ??= diagnostics[diagnostics.length - 1]
    }
    finished = false
  }

  // Cutter compensation is resolved after the run; an interference alarm stops the machine there
  let cut = moves.length
  applyCutterComp(moves, (d) => {
    const alarm = machineAlarm(d.code, d.params)
    const full: Diagnostic = alarm ? { ...d, severity: 'alarm', alarm } : d
    diagnostics.push(full)
    if (alarm?.stops && d.moveIndex !== undefined && d.moveIndex < cut) {
      cut = d.moveIndex
      stoppedBy = full
    }
  })
  if (cut < moves.length) {
    moves.length = cut
    finished = false
    const keep = diagnostics.filter((d) => d === stoppedBy || (d.moveIndex ?? 0) <= cut)
    diagnostics.length = 0
    diagnostics.push(...keep)
  }

  const result: SimulationResult = {
    moves,
    diagnostics,
    finished,
    totalTimeS: moves.reduce((s, m) => s + m.durationS, 0),
    tools: toolsUsed,
    variables
  }
  if (stoppedBy) result.stoppedBy = stoppedBy
  return result
}
