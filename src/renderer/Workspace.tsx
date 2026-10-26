import {
  memo,
  useCallback,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type Ref
} from 'react'
import {
  compareParts,
  findChuckCollisions,
  findTailstockCollisions,
  findHolderCollisions,
  holderOf,
  keepStockOnTable,
  programTemplate,
  simulate,
  stockFromPath,
  toolMount,
  workShift,
  type ConfigIssue,
  type ProgramKind,
  type Control,
  type Diagnostic,
  type Exercise,
  type Move,
  type Vec3,
  type Machine,
  type Project,
  type Severity,
  type SimulationInput,
  type Stock,
  type Tool,
  type ToolLibrary,
  type ToolOffsets,
  type WorkOffsets
} from '@core/index'
import type { MenuCommand } from '../preload/api'
import { EXERCISES, isExample, type BundledConfigs, type Program } from './bundled'
import { CodeView } from './components/CodeView'
import { ProgramEditor, type EditorHandle } from './components/ProgramEditor'
import { CncModal } from './components/CncModal'
import { Player, type PanelState, type Strip } from './components/Player'
import { toolColor } from './toolColors'
import { PositionAll } from './components/PositionPanel'
import { GROUPS, groupOf, SoftKeys, type Screen } from './components/SoftKeys'
import { MdiKeypad } from './components/MdiKeypad'
import { OperatorPanel } from './components/OperatorPanel'
import { StatusHeader } from './components/StatusHeader'
import { StockEditor } from './components/StockEditor'
import { ToolEditor } from './components/ToolEditor'
import { ToolOffsetsEditor } from './components/ToolOffsetsEditor'
import { WorkOffsetsEditor } from './components/WorkOffsetsEditor'
import { PATH_COLORS, Viewport3D, type ViewKind } from './components/Viewport3D'
import { ViewToolbar } from './components/ViewToolbar'
import { FeatureTree } from './components/FeatureTree'
import { AlarmLine } from './components/AlarmLine'
import { useI18n } from './i18n'
import { ExerciseCard, type ExerciseCheck } from './components/ExerciseCard'
import { explainLine, helpForWord } from './help'
import { useLibraries } from './libraries'
import { defaultSetup, offsetsFor, projectData, setupFromProject, STOCK_COLOR, type Setup } from './project'
import { createSimulator } from './simulation'
import { renderPart, thumbKey, writeThumb } from './thumbnail'
import {
  blockEnd,
  buildTimeline,
  distanceToGo,
  formatTime,
  fractionOf,
  moveAt,
  nextStop,
  operations,
  pointAlong,
  positionAlong,
  sameMoment,
  stopTimes,
  type Overrides,
  type Timeline
} from './playback'



interface Simulation {
  timeline: Timeline | null
  time: number
  playing: boolean
}

const NO_SIMULATION: Simulation = { timeline: null, time: 0, playing: false }

const overridesOf = (p: PanelState): Overrides => ({ feed: p.feed / 100, rapid: p.rapid / 100, spindle: p.spindle / 100 })

function simInput(
  program: Program | null,
  machine: Machine | undefined,
  control: Control | undefined,
  cfg: BundledConfigs,
  setup: Setup,
  blockSkip = false
): SimulationInput | null {
  if (!program || !machine || !control) return null
  const alarms = cfg.alarmCatalogs.find((a) => a.id === control.alarms) ?? null
  return {
    text: program.text,
    machine,
    control,
    tools: setup.tools,
    alarms,
    workOffsets: setup.workOffsets,
    toolOffsets: setup.toolOffsets,
    options: { blockDelete: blockSkip }
  }
}

/** Page titles as the control shows them. */
const PAGE_TITLES: Record<Screen, string> = {
  pos: 'POSITION (ALL)',
  prog: 'PROGRAM',
  graph: 'PROGRAM CHECK',
  offset: 'OFFSET',
  work: 'WORK COORDINATES',
  msg: 'ALARM MESSAGE',
  setting: 'SYSTEM'
}
const FONT_KEY = 'cncsim.codeFontSize'
const ORTHO_KEY = 'cncsim.ortho'
const readFlag = (key: string, fallback: boolean) => {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}
const WIDTH_KEY = 'cncsim.codeWidth'
const readNumber = (key: string, fallback: number) => {
  try {
    const v = Number(localStorage.getItem(key))
    return Number.isFinite(v) && v > 0 ? v : fallback
  } catch {
    return fallback
  }
}
const writeNumber = (key: string, v: number) => {
  try {
    localStorage.setItem(key, String(v))
  } catch {
    // not persisted
  }
}

/** Browser mode: hands a file to the downloads folder. */
function download(name: string, text: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

const SEVERITY_ORDER: Record<Severity, number> = { alarm: 0, warning: 1, info: 2 }

type Translate = ReturnType<typeof useI18n>['t']
const configIssueText = (t: Translate, i: ConfigIssue) =>
  i.kind === 'invalid-json'
    ? t('config.invalidJson', { source: i.source, message: i.message })
    : t('config.issue', { source: i.source, path: i.path || t('config.root'), message: i.message })

interface MessagesProps {
  issues: ConfigIssue[]
  diagnostics: Diagnostic[]
  collisions: ReturnType<typeof findHolderCollisions>
  chuckCollisions: ReturnType<typeof findChuckCollisions>
  onDiagnostic: (d: Diagnostic) => void
  onMove: (moveIndex: number) => void
  /** Without the block and its heading (inside another panel). */
  bare?: boolean
}

/**
 * Messages and alarms of the run. Memoized: playback re-renders the app on every frame, and a CAM
 * program can bring thousands of messages that would all be drawn again each time.
 */
const Messages = memo(function Messages({ issues, diagnostics, collisions, chuckCollisions, onDiagnostic, onMove, bare }: MessagesProps) {
  const { t } = useI18n()
  const count = diagnostics.length + issues.length + collisions.length + chuckCollisions.length
  return (
    <div className={bare ? 'messages' : 'block'}>
      {!bare && (
        <h2>
          {t('messages.title')}
          {count > 0 && <span className="count">{count}</span>}
        </h2>
      )}
      {issues.map((i, k) => (
        <p key={`cfg${k}`} className="msg alarm">
          <b>{t('severity.alarm')}</b>
          <span>{configIssueText(t, i)}</span>
        </p>
      ))}
      {diagnostics.map((d, k) => (
        <button key={k} className={`msg ${d.severity}`} onClick={() => onDiagnostic(d)}>
          <b>{d.alarm?.code ?? t(`severity.${d.severity}`)}</b>
          <span>
            L{d.line + 1} · {d.alarm?.message && <strong>{d.alarm.message} · </strong>}
            {t(`diag.${d.code}`, d.params)}
          </span>
        </button>
      ))}
      {collisions.map((c) => (
        <button key={`col${c.tool}|${c.line}`} className="msg warning" onClick={() => onMove(c.moveIndex)}>
          <b>{t('collision.label')}</b>
          <span>
            L{c.line + 1} · {t('collision.holder', { tool: String(c.tool).padStart(2, '0'), depth: c.depth })}
          </span>
        </button>
      ))}
      {chuckCollisions.map((c) => (
        <button key={`${c.part ?? 'chuck'}${c.tool}|${c.line}`} className="msg alarm" onClick={() => onMove(c.moveIndex)}>
          <b>{t('collision.label')}</b>
          <span>
            L{c.line + 1} · {t(c.part === 'tailstock' ? 'collision.tailstock' : 'collision.chuck', { tool: String(c.tool).padStart(2, '0'), z: c.z })}
          </span>
        </button>
      ))}
      {!count && <p className="muted">{t('messages.none')}</p>}
    </div>
  )
})

/** Machine (one control screen with soft keys) or 3D model (program, 3D view, feature panel). */
export type Layout = 'machine' | 'model'

/** What a new tab opens: everything the document needs is decided before it is created. */
export type DocInit =
  | { kind: 'project'; program: Program; project: Project; projectPath: string }
  | { kind: 'program'; program: Program; machineId: string; controlId: string; library: ToolLibrary | null }
  | { kind: 'new'; machineId: string; controlId: string; programKind: ProgramKind; number: number }
  | { kind: 'exercise'; id: string }

/** What the tab strip and the status bar show about a document. */
export interface DocState {
  title: string
  dirty: boolean
  /** Project (.cncsim) or a program alone (.nc). */
  kind: 'project' | 'program'
}

/** Commands the shell forwards to the document in front (menus, keyboard). */
export interface WorkspaceHandle {
  command: (command: MenuCommand) => void
  /** Asks before throwing away unsaved edits; true when the tab may close. */
  canClose: () => boolean
}

interface Props {
  init: DocInit
  cfg: BundledConfigs
  /** Only the tab in front draws the 3D view, plays and takes keys. */
  active: boolean
  layout: Layout
  learn: boolean
  onLearn: (on: boolean) => void
  /** HELP key: the shell shows the tour. */
  onHelp: () => void
  onState: (state: DocState) => void
  /** Browser mode keeps recent files itself. */
  onRecord: (program: Program) => void
  ref?: Ref<WorkspaceHandle>
}

/** One open document: its program, machine, setup and simulation, shown in the machine or 3D model layout. */
export function Workspace({ init, cfg, active, layout, learn, onLearn, onHelp, onState, onRecord, ref }: Props) {
  const { t, l } = useI18n()
  // Everything the document starts with comes from what was opened
  const [start] = useState(() => {
    if (init.kind === 'project') {
      const m = cfg.machines.find((x) => x.id === init.project.machine) ?? cfg.machines[0]
      const c = cfg.controls.find((x) => x.id === init.project.control) ?? cfg.controls.find((x) => x.id === m?.defaultControl)
      return { program: init.program, machineId: m?.id ?? '', controlId: c?.id ?? '', setup: setupFromProject(init.project, m, cfg.libraries), projectPath: init.projectPath, mode: 'mem' as const, dirty: false, exercise: null }
    }
    if (init.kind === 'program') {
      const m = cfg.machines.find((x) => x.id === init.machineId)
      const base = defaultSetup(m, cfg.libraries)
      const tools = init.library ?? base.tools
      const setup = { ...base, tools, toolOffsets: offsetsFor(tools, m) }
      return { program: init.program, machineId: init.machineId, controlId: init.controlId, setup, projectPath: null, mode: 'mem' as const, dirty: false, exercise: null }
    }
    if (init.kind === 'new') {
      const m = cfg.machines.find((x) => x.id === init.machineId)
      const c = cfg.controls.find((x) => x.id === init.controlId)
      // Header written with the selected control's own codes, in its file format
      const text =
        m && c
          ? programTemplate(m, c, init.programKind, init.number, {
              newProgram: t('template.newProgram'),
              workZero: t('template.workZero'),
              latheZero: t('template.latheZero'),
              tool: t('template.tool'),
              machineHere: t('template.machineHere'),
              parameters: t('template.parameters'),
              passes: t('template.passes'),
              length: t('template.length'),
              stepDown: t('template.stepDown'),
              totalDepth: t('template.totalDepth'),
              feed: t('template.feed'),
              startDiameter: t('template.startDiameter'),
              finalDiameter: t('template.finalDiameter')
            })
          : ''
      const program = { name: `O${String(init.number).padStart(4, '0')}.nc`, path: '', text }
      // A new program starts unsaved, in EDIT, on the machine's own setup
      return { program, machineId: init.machineId, controlId: init.controlId, setup: defaultSetup(m, cfg.libraries), projectPath: null, mode: 'edit' as const, dirty: true, exercise: null }
    }
    const e = EXERCISES.find((x) => x.id === init.id)
    const ex = e?.exercise
    const m = cfg.machines.find((x) => x.id === ex?.machine) ?? cfg.machines[0]
    const base = defaultSetup(m, cfg.libraries)
    const setup: Setup = ex ? { ...base, stock: { ...ex.stock }, workOffsets: ex.workOffsets ?? {} } : base
    const program = { name: `${init.id}.nc`, path: `example:learn/${init.id}.nc`, text: ex?.start ?? '' }
    return { program, machineId: m?.id ?? '', controlId: ex?.control ?? m?.defaultControl ?? '', setup, projectPath: null, mode: 'edit' as const, dirty: false, exercise: e ?? null }
  })
  const [machineId, setMachineId] = useState(start.machineId)
  const machine = cfg.machines.find((m) => m.id === machineId) ?? cfg.machines[0]
  const [controlId, setControlId] = useState(start.controlId)
  const control = cfg.controls.find((c) => c.id === controlId)
  const [program, setProgram] = useState<Program>(start.program)
  // EDIT: the text is in CodeMirror (read it with editor.current.getText()); MEM: read-only run screen
  const [mode, setMode] = useState<'mem' | 'edit'>(start.mode)
  const [dirty, setDirty] = useState(start.dirty)
  const editor = useRef<EditorHandle>(null)
  /** Bumped on each edit: the path is recomputed a moment after typing stops. */
  const [editTick, setEditTick] = useState(0)
  // Stock, tools and work offsets: from the open project, or the machine's defaults
  const [setup, setSetup] = useState<Setup>(start.setup)
  /** The .cncsim file the setup came from, or null for a program opened alone. */
  const [projectPath, setProjectPath] = useState<string | null>(start.projectPath)
  // Simulated in the worker as soon as the tab opens (below)
  const [sim, setSim] = useState<Simulation>(NO_SIMULATION)
  // One worker for the window's lifetime
  const [simulator] = useState(createSimulator)
  const [busy, setBusy] = useState(false)
  // Operator panel: single block, M01, block delete and overrides, as on the machine
  const [panel, setPanel] = useState<PanelState>({ singleBlock: false, optionalStop: false, blockSkip: false, feed: 100, rapid: 100, spindle: 100 })
  /** Lines where playback stops before running them. */
  const [breakpoints, setBreakpoints] = useState<ReadonlySet<number>>(() => new Set())
  const [fontSize, setFontSize] = useState(() => readNumber(FONT_KEY, 11.5))
  const [codeWidth, setCodeWidth] = useState(() => readNumber(WIDTH_KEY, 300))
  /** Page of the machine layout picked with the soft keys. */
  const [screen, setScreen] = useState<Screen>('graph')
  const [view, setView] = useState<{ kind: ViewKind; n: number }>({ kind: 'iso', n: 0 })
  /** Orthographic camera (as in CAD programs) or perspective; kept for the next documents. */
  const [ortho, setOrtho] = useState(() => readFlag(ORTHO_KEY, true))
  /** Operation picked in the feature tree (highlighted in 3D), -1 for none. */
  const [selectedOp, setSelectedOp] = useState(-1)
  /** An MDI key was pressed outside EDIT: the title bar says to switch mode. */
  const [mdiNotice, setMdiNotice] = useState(false)
  /** Picture of the finished part (top of the feature tree, and the recent files list). */
  const [partThumb, setPartThumb] = useState<string | null>(null)
  /** 3D view: show the stock as the whole program leaves it, wherever playback is. */
  const [finished, setFinished] = useState(false)
  const [follow, setFollow] = useState(false)
  /** Measuring session in the 3D view, 0 when off (each new session starts with no points). */
  const [measuring, setMeasuring] = useState(0)
  /** Guided exercise open, and the result of its last check. */
  const [exercise, setExercise] = useState<{ id: string; exercise: Exercise } | null>(start.exercise)
  const [exerciseCheck, setExerciseCheck] = useState<ExerciseCheck | null>(null)
  const [speed, setSpeed] = useState(20)
  const [showRapids, setShowRapids] = useState(true)
  const [showStock, setShowStock] = useState(true)
  const [showFixture, setShowFixture] = useState(true)
  /** Lathe: chuck and part turn in C while the tool stays in X/Z (off: the part stands still). */
  const [machineView, setMachineView] = useState(true)
  /** Show the stock being cut where the tool passes. */
  const [machining, setMachining] = useState(true)
  const libraries = useLibraries()
  const [editingTools, setEditingTools] = useState(false)
  const [editingStock, setEditingStock] = useState(false)
  const [editingOffsets, setEditingOffsets] = useState(false)
  const [editingToolOffsets, setEditingToolOffsets] = useState(false)

  const lines = useMemo(() => program.text.replace(/\r/g, '').split('\n'), [program])
  /** First block of the program (skips the % leader and blank lines): where RESET puts the cursor. */
  const startLine = useMemo(() => Math.max(0, lines.findIndex((l) => l.trim() !== '' && l.trim() !== '%')), [lines])
  const tl = sim.timeline
  const result = tl?.result ?? null
  /** RESET: at the start and not running, nothing has been executed yet. */
  const atReset = sim.time <= 0 && !sim.playing
  const index = tl && !atReset ? moveAt(tl, sim.time) : -1
  const fraction = tl && index >= 0 ? fractionOf(tl, index, sim.time) : 1
  const moves = result?.moves ?? []
  const move = moves[index]
  const position = move ? positionAlong(moves[index - 1], move, fraction) : undefined
  const machinePosition = move ? positionAlong(moves[index - 1], move, fraction, (m) => m.machinePosition) : undefined

  // ---- actions (simulation is recomputed in event handlers, not in effects) ----
  /**
   * Simulates in the worker: the window stays responsive on long programs. Until the answer comes
   * the previous result stays on screen, with "Simulating…" over the 3D view.
   */
  function simulateWith(p: Program | null, m: Machine | undefined, c: Control | undefined, s: Setup = setup, pn: PanelState = panel) {
    const input = simInput(p, m, c, cfg, s, pn.blockSkip)
    if (!input) {
      simulator.cancel()
      setBusy(false)
      setSim(NO_SIMULATION)
      return
    }
    setBusy(true)
    void simulator.run(input).then((result) => {
      setBusy(false)
      // Like the control after loading a program: RESET, cursor at the top, nothing run yet
      setSim({ timeline: buildTimeline(result, overridesOf(pn)), time: 0, playing: false })
    })
  }
  const changeFont = useCallback((delta: number) => {
    setFontSize((f) => {
      const next = Math.min(22, Math.max(8, Math.round((f + delta) * 2) / 2))
      writeNumber(FONT_KEY, next)
      return next
    })
  }, [])
  /** Drag the divider to widen the program panel; `dir` is -1 when the program is on the right. */
  function startResize(e: ReactPointerEvent<HTMLDivElement>, dir: 1 | -1) {
    const startX = e.clientX
    const startW = codeWidth
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    let w = startW
    const move = (ev: PointerEvent) => {
      w = Math.min(window.innerWidth * 0.6, Math.max(200, startW + dir * (ev.clientX - startX)))
      setCodeWidth(w)
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      writeNumber(WIDTH_KEY, Math.round(w))
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }
  /** The program with the text being edited, if any. */
  function currentProgram(): Program {
    if (mode !== 'edit' || !editor.current) return program
    return { ...program, text: editor.current.getText() }
  }
  /** Asks before throwing away unsaved edits. */
  function canDiscard(): boolean {
    return !dirty || window.confirm(t('dialog.unsavedDiscard', { name: program.name }))
  }
  async function saveProject(saveAs: boolean) {
    const current = currentProgram()
    if (!machine || !control) return
    const data = projectData(machine.id, control.id, setup)
    let p = current
    if (!window.api) {
      const name = projectPath ?? `${p.name.replace(/\.[^.]+$/, '')}.cncsim`
      download(name, JSON.stringify({ ...data, program: p.name, programText: p.text }, null, 2), 'application/json')
      setProjectPath(name)
      return
    }
    // The project points to the program file, so a new or edited program is saved first
    if (dirty || !p.path || p.path.startsWith('example:')) {
      const saved = await save(false)
      if (!saved) return
      p = saved
    }
    const path = await window.api.saveProject({ project: data, projectPath: saveAs ? '' : (projectPath ?? ''), programPath: p.path }, saveAs)
    if (path) setProjectPath(path)
  }
  /** Saves the program; returns it with its new name and path, or null if cancelled. */
  async function save(saveAs: boolean): Promise<Program | null> {
    let p = currentProgram()
    if (window.api) {
      // The example and new programs have no file yet: always ask where to save
      const r = await window.api.saveFile(p, saveAs || !p.path || p.path.startsWith('example:'))
      if (!r) return null
      p = { name: r.name, path: r.path, text: r.text }
    } else {
      // Browser: the file goes to the downloads folder
      download(p.name, p.text, 'text/plain')
      onRecord(p)
    }
    setProgram(p)
    setDirty(false)
    return p
  }
  /** The MDI keys only type in EDIT, as on the control: elsewhere the screen asks for it for a moment. */
  function askEdit() {
    setMdiNotice(true)
    setTimeout(() => setMdiNotice(false), 2500)
  }
  /** An MDI key: a letter starts a new word (with a space), EOB ends the block. */
  function mdiType(key: string) {
    const ed = editor.current
    if (mode !== 'edit' || !ed) {
      askEdit()
      return
    }
    if (key === 'EOB') ed.insert(control?.fileFormat?.eob === 'semicolon' ? ';\n' : '\n')
    else if (/^[A-Z]$/.test(key) && !/[\s([]$|^$/.test(ed.textBeforeCursor())) ed.insert(` ${key}`)
    else ed.insert(key)
  }
  /** EDIT, like on the control: a running program stops (it only runs in MEM). */
  function startEdit() {
    setSim((s) => ({ ...s, playing: false }))
    setMode('edit')
  }
  function edited() {
    setDirty(true)
    setEditTick((n) => n + 1)
  }
  /** MEM: take the edited text and run it, like switching the control from EDIT to MEM. */
  function runMem() {
    const p = currentProgram()
    if (p !== program) setProgram(p)
    setMode('mem')
    simulateWith(p, machine, control)
  }
  function changeMachine(id: string) {
    const m = cfg.machines.find((x) => x.id === id)
    const c = cfg.controls.find((x) => x.id === m?.defaultControl) ?? control
    setMachineId(id)
    if (c) setControlId(c.id)
    // Another machine brings its own stock; tools stay unless the machine kind changes
    // (lathe tools on a machining center make no sense, and the other way round)
    const kindOf = (x: Machine | undefined) => x?.kinematics.startsWith('lathe')
    const own = defaultSetup(m, cfg.libraries)
    const sameKind = kindOf(m) === kindOf(machine)
    const s = { ...setup, stock: own.stock, tools: sameKind ? setup.tools : own.tools, toolOffsets: sameKind ? setup.toolOffsets : own.toolOffsets }
    setSetup(s)
    simulateWith(currentProgram(), m, c, s)
  }
  function changeControl(id: string) {
    setControlId(id)
    simulateWith(currentProgram(), machine, cfg.controls.find((x) => x.id === id))
  }
  function applyStock(stock: Stock) {
    // The stock is only drawn for now (no material removal), so the simulation stays as is
    setSetup({ ...setup, stock })
    setEditingStock(false)
  }
  function applyOffsets(workOffsets: WorkOffsets, keepStock: boolean) {
    // As on the machine, the stock stays clamped where it is: a changed zero moves the cut, not the part
    const stock = setup.stock && keepStock ? keepStockOnTable(setup.stock, setup.workOffsets, workOffsets) : setup.stock
    const s = { ...setup, workOffsets, stock }
    setSetup(s)
    setEditingOffsets(false)
    simulateWith(currentProgram(), machine, control, s)
  }
  function applyTools(lib: ToolLibrary) {
    // New offset numbers are measured from the tools; the ones already in the table stay as they are
    const s = { ...setup, tools: lib, toolOffsets: offsetsFor(lib, machine, setup.toolOffsets) }
    setSetup(s)
    setEditingTools(false)
    simulateWith(currentProgram(), machine, control, s)
  }
  function applyToolOffsets(toolOffsets: ToolOffsets) {
    const s = { ...setup, toolOffsets }
    setSetup(s)
    setEditingToolOffsets(false)
    simulateWith(currentProgram(), machine, control, s)
  }
  const seek = useCallback((time: number) => {
    setSim((s) => ({ ...s, playing: false, time: Math.max(0, Math.min(s.timeline?.total ?? 0, time)) }))
  }, [])
  /** Shows move k just finished. A hair before its end: exactly at the end the next move would be current. */
  const seekMove = useCallback((k: number) => {
    setSim((s) => {
      const end = s.timeline?.cumulative[k + 1] ?? 0
      const start = s.timeline?.cumulative[k] ?? 0
      return { ...s, playing: false, time: Math.max(start, end - 1e-6) }
    })
  }, [])
  function step(dir: -1 | 1) {
    if (!tl?.result.moves.length) return
    const atEnd = fraction >= 1
    let k = dir > 0 ? (atEnd ? index + 1 : index) : atEnd ? index - 1 : index - 1
    k = Math.max(-1, Math.min(tl.result.moves.length - 1, k))
    if (k < 0) seek(0)
    else seekMove(k)
  }
  function togglePlay() {
    // Playing from the end starts over
    setSim((s) => (s.playing ? { ...s, playing: false } : { ...s, playing: true, time: s.time >= (s.timeline?.total ?? 0) ? 0 : s.time }))
  }

  // Clicking a line starts from its next execution (loops run the same line many times):
  // the tool goes to the start of that move, so Play runs that block first.
  // Reads the current move from the state itself, so the callback never changes and the program
  // screen does not re-render just because playback moved on.
  const jumpToLine = useCallback((line: number) => {
    setSim((s) => {
      const hits = s.timeline?.movesByLine.get(line)
      if (!s.timeline || !hits?.length) return s
      const current = s.time <= 0 && !s.playing ? -1 : moveAt(s.timeline, s.time)
      const next = hits.find((h) => h > current) ?? hits[0] ?? 0
      // A hair past the start, so the block counts as the current one and not as RESET
      return { ...s, playing: false, time: (s.timeline.cumulative[next] ?? 0) + 1e-6 }
    })
  }, [])

  // ---- operator panel ----
  function changePanel(change: Partial<PanelState>) {
    const next = { ...panel, ...change }
    setPanel(next)
    // Block delete changes which blocks run: simulate again
    if (change.blockSkip !== undefined && change.blockSkip !== panel.blockSkip) simulateWith(currentProgram(), machine, control, setup, next)
    // Overrides change the times: same point of the program on the new timeline
    else if (change.feed !== undefined || change.rapid !== undefined || change.spindle !== undefined)
      setSim((s) => {
        if (!s.timeline) return s
        const timeline = buildTimeline(s.timeline.result, overridesOf(next))
        return { ...s, timeline, time: sameMoment(s.timeline, timeline, s.time) }
      })
  }
  const toggleBreakpoint = useCallback((line: number) => {
    setBreakpoints((b) => {
      const next = new Set(b)
      if (!next.delete(line)) next.add(line)
      return next
    })
  }, [])
  const stops = useMemo(() => (tl ? stopTimes(tl, { optionalStop: panel.optionalStop, breakpoints }) : []), [tl, panel.optionalStop, breakpoints])

  // ---- playback loop ----
  // Runs until the end, the next stop (M00, M01 with OPTIONAL STOP, a breakpoint) or, in single block,
  // the end of the current block; Run again goes on from there, as cycle start does.
  const playing = sim.playing
  const singleBlock = panel.singleBlock
  useEffect(() => {
    if (!playing) return
    let last = 0
    let frame = requestAnimationFrame(function tick(ts) {
      const dt = last ? (ts - last) / 1000 : 0
      last = ts
      setSim((s) => {
        if (!s.playing || !s.timeline) return s
        const total = s.timeline.total
        const limit = Math.min(nextStop(stops, s.time, total), singleBlock ? blockEnd(s.timeline, s.time) : total)
        const time = Math.min(limit, s.time + dt * speed)
        return { ...s, time, playing: time < limit - 1e-12 }
      })
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing, speed, stops, singleBlock])

  // The tab opens on RESET with its program simulated, like the control after loading it
  const simulateOnOpen = useEffectEvent(() => simulateWith(program, machine, control, setup))
  useEffect(() => simulateOnOpen(), [])
  // Menus and keys reach only the tab in front (the shell forwards them)
  useImperativeHandle(ref, () => ({
    command: (command: MenuCommand) => {
      if (command === 'save' || command === 'saveAs') void save(command === 'saveAs')
      else if (command === 'saveProject') void saveProject(false)
      else if (command.startsWith('view:')) setView((v) => ({ kind: command.slice(5) as ViewKind, n: v.n + 1 }))
    },
    canClose: canDiscard
  }))
  // The tab strip shows the name, the unsaved mark and whether this is a project
  useEffect(() => onState({ title: program.name, dirty, kind: projectPath ? 'project' : 'program' }), [program.name, dirty, projectPath, onState])
  // While editing, the path, messages and alarms follow the text: recomputed (at RESET)
  // a moment after typing stops, so the view never shows a program that is no longer there
  const refreshFromEditor = useEffectEvent(() => {
    if (mode === 'edit') simulateWith(currentProgram(), machine, control)
  })
  useEffect(() => {
    if (!editTick) return
    const id = setTimeout(refreshFromEditor, 700)
    return () => clearTimeout(id)
  }, [editTick])

  // ---- derived lists ----
  const diagnostics = useMemo(
    () => (result?.diagnostics ?? []).slice().sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.line - b.line),
    [result]
  )
  const marks = useMemo(() => {
    const m = new Map<number, Severity>()
    for (const d of diagnostics) {
      const prev = m.get(d.line)
      if (!prev || SEVERITY_ORDER[d.severity] < SEVERITY_ORDER[prev]) m.set(d.line, d.severity)
    }
    return m
  }, [diagnostics])
  const hits = useMemo(() => new Set(tl?.movesByLine.keys() ?? []), [tl])

  /** A diagnostic on a line without moves (e.g. the alarm block) goes to where the machine stopped. */
  const jumpToDiagnostic = useCallback(
    (d: Diagnostic) => {
      if (tl?.movesByLine.has(d.line)) jumpToLine(d.line)
      else if (d.moveIndex !== undefined) {
        if (d.moveIndex > 0) seekMove(d.moveIndex - 1)
        else seek(0)
      }
    },
    [tl, jumpToLine, seekMove, seek]
  )
  const stoppedBy = result?.stoppedBy

  const machineKind = machine && (machine.kinematics.startsWith('lathe') ? 'lathe' : 'mill')
  const shownAxes = machine ? machine.axes.map((a) => a.name) : ['X', 'Y', 'Z']
  const lathe = machineKind === 'lathe'
  const toGo = move && position ? distanceToGo(moves, index, position) : undefined
  const maxRpm = machine?.spindles.find((s) => s.type !== 'live')?.maxRpm ?? 0
  const maxLiveRpm = machine?.spindles.find((s) => s.type === 'live')?.maxRpm ?? 0

  // ---- tool in the spindle, holder and possible holder collisions ----
  const toolTip = move ? pointAlong(move, fraction) : null
  const libraryTool = move ? setup.tools?.tools.find((x) => x.number === move.state.tool) : undefined
  // A T word without a library entry still gets a body, sized by the compensation radius
  const currentTool: Tool | undefined =
    libraryTool ?? (move && move.state.tool > 0 ? { number: move.state.tool, name: '', type: 'flat-endmill', diameter: Math.max(1, move.toolRadius * 2), length: 40 } : undefined)
  const holder = currentTool ? holderOf(currentTool, setup.tools, lathe) : undefined
  const mount = currentTool ? toolMount(currentTool, holder, lathe) : 'axial'
  const collisions = useMemo(() => {
    const s = setup.stock
    const shift = workShift(setup.workOffsets, s?.workOffset ?? 'G54')
    return findHolderCollisions({
      moves: result?.moves ?? [],
      tools: setup.tools,
      stock: s,
      stockZero: lathe ? [0, 0, shift.Z] : [shift.X, shift.Y, shift.Z],
      lathe
    })
  }, [result, setup, lathe])
  const colliding = !!move && collisions.some((c) => c.line === move.line && c.tool === move.state.tool)
  const chuckCollisions = useMemo(() => {
    if (!lathe) return []
    const shift = workShift(setup.workOffsets, setup.stock?.workOffset ?? 'G54')
    const moves = result?.moves ?? []
    const zero: Vec3 = [0, 0, shift.Z]
    return [...findChuckCollisions(moves, setup.stock, zero, machine?.chuck), ...findTailstockCollisions(moves, setup.stock, zero, machine?.tailstock)]
  }, [result, setup, lathe, machine])
  const hitHere = (part: 'chuck' | 'tailstock') =>
    !!move && chuckCollisions.some((c) => (c.part ?? 'chuck') === part && c.line === move.line && c.tool === move.state.tool)
  const chuckHit = hitHere('chuck')
  const tailstockHit = hitHere('tailstock')
  const ballTools = useMemo(() => new Set(setup.tools?.tools.filter((x) => x.type === 'ball-endmill').map((x) => x.number) ?? []), [setup.tools])
  /** Stock wrapping what the program cuts, offered in the stock editor. */
  const programStock = useMemo(() => stockFromPath(result?.moves ?? [], lathe), [result, lathe])
  // C angle: from the tip in polar interpolation (C is not tracked as an angle there), else the C position
  const spindleAngle = move ? (move.state.polar && toolTip ? Math.atan2(toolTip[1], toolTip[0]) : ((position?.C ?? 0) * Math.PI) / 180) : 0
  // The spindle turns while it is on (M03/M04 until M05), also in feed hold and single block stops,
  // as on the machine; faster with the speed and the spindle override (drawn slowed down)
  const spinRate = move?.state.spindleOn && !move.state.liveToolOn ? Math.min(14, Math.max(1.2, (move.state.spindleSpeed * panel.spindle) / 100 / 250)) : 0
  // Learning mode: help for a word on this control, and the words of the block at the cursor
  const help = useCallback((word: string) => helpForWord(word, control, l), [control, l])
  const helpLine = move?.line ?? (atReset ? startLine : -1)
  const blockHelp = useMemo(() => (learn && helpLine >= 0 ? explainLine(lines[helpLine] ?? '', control, l) : []), [learn, helpLine, lines, control, l])
  // Guided exercise: the solution machined on the same setup, and the check of the student's program
  const stockZero = useMemo<Vec3>(() => {
    const sh = workShift(setup.workOffsets, setup.stock?.workOffset ?? 'G54')
    return lathe ? [0, 0, sh.Z] : [sh.X, sh.Y, sh.Z]
  }, [setup, lathe])
  const reference = useMemo<readonly Move[]>(() => {
    if (!exercise) return []
    const input = simInput({ name: 'solution', path: '', text: exercise.exercise.solution }, machine, control, cfg, setup)
    return input ? simulate(input).moves : []
  }, [exercise, machine, control, cfg, setup])
  // After each simulation, a picture of the finished part, a moment later so the screen comes first
  useEffect(() => {
    const stock = setup.stock
    if (busy || !result?.moves.length || !stock) return
    const id = setTimeout(() => {
      const url = renderPart({ moves: result.moves, stock, zero: stockZero, lathe, ballTools })
      if (!url) return
      setPartThumb(url)
      const path = projectPath ?? program.path
      if (path) writeThumb(thumbKey('path', path), url)
    }, 400)
    return () => clearTimeout(id)
  }, [result, busy, setup.stock, stockZero, lathe, ballTools, projectPath, program.path])
  function checkExercise() {
    const p = currentProgram()
    const input = simInput(p, machine, control, cfg, setup)
    if (!exercise || !input || !setup.stock) return
    const r = simulate(input)
    const d = compareParts(reference, r.moves, setup.stock, stockZero, lathe, ballTools)
    const alarms = r.diagnostics.filter((x) => x.severity === 'alarm').length
    const tol = exercise.exercise.tolerance
    setExerciseCheck({ ...d, finished: r.finished, alarms, ok: r.finished && !alarms && d.left <= tol && d.gouge <= tol })
  }
  const messageCount = diagnostics.length + cfg.issues.length + collisions.length + chuckCollisions.length
  const ops = useMemo(() => (tl ? operations(tl) : []), [tl])
  const currentOp = index < 0 ? -1 : ops.findIndex((o) => o.first <= index && index <= o.last)
  const highlightOp = selectedOp >= 0 ? ops[selectedOp] : undefined
  const toolNames = useMemo(() => new Map(setup.tools?.tools.map((x) => [x.number, l(x.name)]) ?? []), [setup.tools, l])
  // Timeline under the slider: tools in color, and where the run stops, alarms or may collide
  const strip = useMemo<Strip | undefined>(() => {
    if (!tl) return undefined
    const toolLabel = (tool: number) => (tool > 0 ? `T${String(tool).padStart(2, '0')} ${toolNames.get(tool) ?? ''}`.trim() : '—')
    return {
      segments: ops.map((o) => ({ start: o.start, end: o.end, color: toolColor(o.tool), title: t('strip.tool', { tool: toolLabel(o.tool), time: formatTime(o.end - o.start) }) })),
      marks: [
        ...stopTimes(tl, { optionalStop: true, breakpoints }).map((at) => ({ at, kind: 'stop' as const, title: t('strip.stop') })),
        ...[...collisions, ...chuckCollisions].map((c) => ({ at: tl.cumulative[c.moveIndex] ?? 0, kind: 'collision' as const, title: `${t('strip.collision')} · L${c.line + 1}` })),
        ...(stoppedBy ? [{ at: tl.total, kind: 'alarm' as const, title: `${t('strip.alarm')} · L${stoppedBy.line + 1}` }] : [])
      ]
    }
  }, [tl, ops, toolNames, breakpoints, collisions, chuckCollisions, stoppedBy, t])

  // Operator panel keys from the keyboard, outside text fields and dialogs: Space is cycle start or
  // feed hold, Esc is RESET, S toggles single block
  const onPanelKey = useEffectEvent((e: KeyboardEvent) => {
    if (!active || e.ctrlKey || e.metaKey || e.altKey) return
    const el = e.target instanceof HTMLElement ? e.target : null
    if (el?.closest('input, textarea, select, [contenteditable="true"], .modal-backdrop')) return
    if (e.key === ' ') {
      // A focused button already answers Space by itself
      if (el?.closest('button') || mode === 'edit' || !result?.moves.length) return
      togglePlay()
    } else if (e.key === 'Escape') seek(0)
    else if (e.key.toLowerCase() === 's') changePanel({ singleBlock: !panel.singleBlock })
    // F: zoom to fit, as in CAD programs
    else if (e.key.toLowerCase() === 'f') setView((v) => ({ kind: 'fit', n: v.n + 1 }))
    else return
    e.preventDefault()
  })
  useEffect(() => {
    window.addEventListener('keydown', onPanelKey)
    return () => window.removeEventListener('keydown', onPanelKey)
  }, [])

  // ---- pieces of the screen, laid out by the 3D model or the machine layout ----
  const programPanel = (modalArea: boolean, chrome = true) => (
      <section className="panel">
        {chrome && (
        <div className="panel-title">
          <span className="file" title={`${program.name} · ${t('program.lines', { count: lines.length })}`}>
            {dirty && <span className="dirty" title={t('program.unsaved')}>● </span>}
            {program.name}
            {isExample(program.path) && <span className="tag">{t('start.example')}</span>}
          </span>
          <span className="modes" role="group">
            <button className={`btn tiny ${mode === 'edit' ? 'on' : ''}`} title={t('mode.editHint')} onClick={startEdit}>EDIT</button>
            <button className={`btn tiny ${mode === 'mem' ? 'on' : ''}`} title={t('mode.memHint')} onClick={runMem}>MEM</button>
          </span>
          <button className="btn tiny icon-btn" title={t('program.saveHint')} aria-label={t('program.saveHint')} onClick={() => void save(false)}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
              <path d="M2 1.5h9.5L14.5 4.5V14a.5.5 0 0 1-.5.5H2a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5Z" fill="none" stroke="currentColor" strokeWidth="1.3" />
              <path d="M4.5 1.5v4h6v-4M4 14.5V9.5h8v5" fill="none" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </button>
          <span className="zoom">
            <button className={`btn tiny icon-btn ${learn ? 'on' : ''}`} aria-pressed={learn} title={t('learn.hint')} aria-label={t('learn.hint')} onClick={() => onLearn(!learn)}>
              {/* An open book: learning mode */}
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
                <path d="M8 3.5C6.5 2.5 4 2.3 1.5 2.8v10c2.5-.5 5-.3 6.5.7 1.5-1 4-1.2 6.5-.7v-10C12 2.3 9.5 2.5 8 3.5Zm0 0v10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
            </button>
            <button className="btn tiny" title={t('code.smaller')} aria-label={t('code.smaller')} onClick={() => changeFont(-0.5)}>A−</button>
            <button className="btn tiny" title={t('code.larger')} aria-label={t('code.larger')} onClick={() => changeFont(0.5)}>A+</button>
          </span>
        </div>
        )}
        {/* Like the control: the modal state (F, S, T, active codes and cycle) above the running program */}
        {mode === 'mem' && modalArea && <CncModal move={move} />}
        {mode === 'edit' ? (
          <ProgramEditor ref={editor} text={program.text} fontSize={fontSize} onEdit={edited} help={learn ? help : undefined} />
        ) : (
          <CodeView
            lines={lines}
            currentLine={move?.line ?? (atReset ? startLine : -1)}
            alarmLine={stoppedBy?.line ?? -1}
            marks={marks}
            hits={hits}
            fontSize={fontSize}
            state={playing ? 'start' : sim.time > 0 && sim.time < (tl?.total ?? 0) ? 'hold' : 'reset'}
            onZoom={changeFont}
            onLineClick={jumpToLine}
            breakpoints={breakpoints}
            onToggleBreakpoint={toggleBreakpoint}
            help={learn ? help : undefined}
          />
        )}
        {learn && mode === 'mem' && (
          <div className="help-bar" aria-live="polite">
            {blockHelp.length ? (
              blockHelp.map((w) => (
                <p key={w.word}>
                  <b>{w.word}</b> {w.text}
                </p>
              ))
            ) : (
              <p className="muted">{t('learn.empty')}</p>
            )}
          </div>
        )}
      </section>
  )
  const stage = (
    <div className={`stage ${measuring ? 'measuring' : ''}`}>
      {machine && (
        <Viewport3D
          machine={machine}
          stock={setup.stock}
          workOffsets={setup.workOffsets}
          result={result}
          index={index}
          toolTip={toolTip}
          toolRadius={move?.toolRadius ?? 0}
          tool={currentTool}
          holder={holder}
          mount={mount}
          colliding={colliding}
          machineView={machineView}
          spindleAngle={spindleAngle}
          spinRate={spinRate}
          machining={machining}
          ballTools={ballTools}
          chuckHit={chuckHit}
          tailstockHit={tailstockHit}
          showRapids={showRapids}
          showStock={showStock}
          showFixture={showFixture}
          view={view}
          follow={follow}
          measuring={measuring}
          ortho={ortho}
          finished={finished}
          highlight={highlightOp ? { first: highlightOp.first, last: highlightOp.last } : null}
        />
      )}
      <ViewToolbar
        lathe={lathe}
        onView={(kind) => setView((v) => ({ kind, n: v.n + 1 }))}
        display={{ rapids: showRapids, stock: showStock, fixture: showFixture, machining, machineView, finished }}
        onDisplay={(c) => {
          if (c.rapids !== undefined) setShowRapids(c.rapids)
          if (c.stock !== undefined) setShowStock(c.stock)
          if (c.fixture !== undefined) setShowFixture(c.fixture)
          if (c.machining !== undefined) setMachining(c.machining)
          if (c.machineView !== undefined) setMachineView(c.machineView)
          if (c.finished !== undefined) setFinished(c.finished)
        }}
        ortho={ortho}
        onOrtho={(on) => {
          setOrtho(on)
          try {
            localStorage.setItem(ORTHO_KEY, on ? '1' : '0')
          } catch {
            // not kept
          }
        }}
        follow={follow}
        onFollow={setFollow}
        measuring={!!measuring}
        onMeasure={() => setMeasuring(measuring ? 0 : Date.now())}
      />
      {/* 3D model: the position stays in a corner of the view */}
      {layout === 'model' && position && (
        <div className="stage-dro">
          {shownAxes.map((ax) => (
            <span key={ax}>
              <b>{ax}</b> {position[ax as keyof typeof position].toFixed(3)}
            </span>
          ))}
          {move && <span className="muted">{t('position.blockValue', { line: move.line + 1, move: index + 1, total: moves.length })}</span>}
        </div>
      )}
      <div className="legend">
        <span><i style={{ borderColor: PATH_COLORS.feed }} />{t('legend.programmed')}</span>
        <span><i style={{ borderColor: PATH_COLORS.center }} />{t('legend.center')}</span>
        <span><i style={{ borderColor: PATH_COLORS.rapid }} />{t('legend.rapid')}</span>
      </div>
      {mode === 'edit' && <div className="edit-note">{t('view.editNote')}</div>}
      {busy && <div className="busy-note">{t('sim.running')}</div>}
      {exercise && (
        <ExerciseCard
          exercise={exercise.exercise}
          reference={reference}
          lathe={lathe}
          zero={stockZero}
          check={exerciseCheck}
          onCheck={checkExercise}
          onClose={() => setExercise(null)}
        />
      )}
    </div>
  )
  const player = (
    <Player
      time={sim.time}
      total={tl?.total ?? 0}
      playing={playing}
      speed={speed}
      disabled={!result?.moves.length}
      runDisabled={mode === 'edit'}
      onSeek={seek}
      onTogglePlay={togglePlay}
      onStep={step}
      onSpeed={setSpeed}
      panel={panel}
      onPanel={changePanel}
      strip={strip}
    />
  )
  /** Machine screen: only the simulation controls (speed, timeline); the panel has the machine's keys. */
  const simBar = (
    <Player
      time={sim.time}
      total={tl?.total ?? 0}
      playing={playing}
      speed={speed}
      disabled={!result?.moves.length}
      runDisabled={mode === 'edit'}
      onSeek={seek}
      onTogglePlay={togglePlay}
      onStep={step}
      onSpeed={setSpeed}
      panel={panel}
      onPanel={changePanel}
      strip={strip}
      simOnly
    />
  )
  const projectBlock = (
    <div className="block">
      <h2>{t('project.title')}</h2>
      <p className="muted">
        {projectPath ? projectPath.slice(Math.max(projectPath.lastIndexOf('/'), projectPath.lastIndexOf('\\'), projectPath.indexOf(':')) + 1) : t('project.none')}
      </p>
      <button className="btn" title={t('project.explain')} onClick={() => void saveProject(false)}>{t(projectPath ? 'project.save' : 'project.create')}</button>
      <p className="muted small">{t('project.explain')}</p>
    </div>
  )
  const messagesBlock = (
    <Messages
      issues={cfg.issues}
      diagnostics={diagnostics}
      collisions={collisions}
      chuckCollisions={chuckCollisions}
      onDiagnostic={jumpToDiagnostic}
      onMove={seekMove}
    />
  )
  /** The same messages without their heading, under the feature tree's Messages node. */
  const messagesList = (
    <Messages
      bare
      issues={cfg.issues}
      diagnostics={diagnostics}
      collisions={collisions}
      chuckCollisions={chuckCollisions}
      onDiagnostic={jumpToDiagnostic}
      onMove={seekMove}
    />
  )
  const machineBlock = machine && (
    <div className="block">
    <h2>{t('machine.title')}</h2>
    <p className="muted">
      {machine.manufacturer ? `${machine.manufacturer} · ` : ''}
      {t(`machineType.${machine.type}`)} · {machine.kinematics}
    </p>
    <table className="table">
      <thead>
        <tr><th>{t('machine.axis')}</th><th>{t('machine.travel')}</th><th>{t('machine.rapid')}</th></tr>
      </thead>
      <tbody>
        {machine.axes.map((a) => (
          <tr key={a.name}>
            <td>{a.name}{a.diameter ? ' (Ø)' : ''}</td>
            <td>{a.type === 'rotary' ? t('machine.continuous') : `${a.min} … ${a.max}`}</td>
            <td>{a.rapid}{a.type === 'rotary' ? ' °/min' : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
    <p className="muted">
      {t('machine.spindles')}: {machine.spindles.map((s) => `${l(s.name)} ${s.maxRpm} rpm`).join(' · ')}
    </p>
    {machine.notes && <p className="note">{l(machine.notes)}</p>}
    </div>
  )
  const controlBlock = control && (
    <div className="block">
    <h2>{t('control.title')}</h2>
    <p className="muted">
      {t('control.summary', {
        family: control.family,
        system: control.dialect.gCodeSystem,
        macro: control.dialect.macro,
        g: Object.keys(control.gCodes).length,
        m: Object.keys(control.mCodes).length
      })}
    </p>
    {machine && machineKind !== control.machineType && (
      <p className="warning">
        {t('control.mismatch', {
          controlType: t(`machineType.${control.machineType}`),
          machineType: t(`machineType.${machine.type}`)
        })}
      </p>
    )}
    </div>
  )
  const stockBlock = (
    <div className="block">
      <h2>
        {t('stock.title')}
        <button className="btn tiny head-action" onClick={() => setEditingStock(true)}>{t('tools.edit')}</button>
      </h2>
      {setup.stock ? (
        <p className="stock-summary">
          <i style={{ background: setup.stock.color ?? STOCK_COLOR }} />
          {setup.stock.shape === 'cylinder'
            ? t('stock.summaryCylinder', { diameter: setup.stock.diameter ?? 0, length: setup.stock.length ?? 0 })
            : t('stock.summaryBlock', { x: setup.stock.x ?? 0, y: setup.stock.y ?? 0, z: setup.stock.z ?? 0 })}
          <span className="muted"> · {setup.stock.workOffset ?? 'G54'}</span>
        </p>
      ) : (
        <p className="muted">{t('stock.none')}</p>
      )}
    </div>
  )
  const offsetsBlock = (
    <div className="block">
      <h2>
        {t('offsets.title')}
        <button className="btn tiny head-action" onClick={() => setEditingOffsets(true)}>{t('tools.edit')}</button>
      </h2>
      {Object.keys(setup.workOffsets).length ? (
        <ul className="list mono">
          {Object.entries(setup.workOffsets).map(([name, o]) => (
            <li key={name}>
              <b>{name}</b>{' '}
              {Object.entries(o)
                .map(([ax, v]) => `${ax}${v}`)
                .join(' ')}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t('offsets.none')}</p>
      )}
    </div>
  )
  const toolOffsetsBlock = (
    <div className="block">
      <h2>
        {t('toolOffsets.title')}
        <button className="btn tiny head-action" onClick={() => setEditingToolOffsets(true)}>{t('tools.edit')}</button>
      </h2>
      <ul className="list mono">
        {Object.entries(setup.toolOffsets)
          .sort(([a], [b]) => Number(a) - Number(b))
          .slice(0, 8)
          .map(([n, o]) => (
            <li key={n}>
              <b>{n.padStart(2, '0')}</b>{' '}
              {lathe
                ? `X${o.x ?? 0} Z${o.z ?? 0}${o.nose !== undefined ? ` R${o.nose}` : ''}${o.xWear || o.zWear ? ` · Δ X${o.xWear ?? 0} Z${o.zWear ?? 0}` : ''}`
                : `H${o.length ?? '—'}${o.lengthWear ? `${o.lengthWear > 0 ? '+' : ''}${o.lengthWear}` : ''} D${o.radius ?? '—'}${o.radiusWear ? `${o.radiusWear > 0 ? '+' : ''}${o.radiusWear}` : ''}`}
            </li>
          ))}
      </ul>
      {!Object.keys(setup.toolOffsets).length && <p className="muted">{t('toolOffsets.none')}</p>}
    </div>
  )
  const toolsBlock = (
    <div className="block">
      <h2>
        {t('tools.title')}
        <button className="btn tiny head-action" onClick={() => setEditingTools(true)}>{t('tools.edit')}</button>
      </h2>
      {!setup.tools?.tools.length && <p className="muted">{t('tools.none')}</p>}
      <ul className="list">
        {setup.tools?.tools.map((tool) => (
          <li key={tool.number}>
            <b>T{String(tool.number).padStart(2, '0')}</b> {l(tool.name)}
            <span className="muted"> · {t('tools.radius', { radius: tool.diameter / 2 })} · {tool.holder ?? t('tools.noHolder')}</span>
          </li>
        ))}
      </ul>
    </div>
  )

  return (
    <div className={`workspace ${active ? 'active' : ''}`} hidden={!active}>
      {
        layout === 'model' ? (
          <main className="model-layout" style={{ '--code-w': `${codeWidth}px` } as CSSProperties}>
            <aside className="model-left">
              <FeatureTree
                program={program.name}
                machine={machine?.name ?? ''}
                control={control?.name ?? ''}
                stock={
                  setup.stock
                    ? setup.stock.shape === 'cylinder'
                      ? t('stock.summaryCylinder', { diameter: setup.stock.diameter ?? 0, length: setup.stock.length ?? 0 })
                      : t('stock.summaryBlock', { x: setup.stock.x ?? 0, y: setup.stock.y ?? 0, z: setup.stock.z ?? 0 })
                    : t('stock.none')
                }
                offsets={Object.keys(setup.workOffsets)}
                tools={setup.tools?.tools.map((x) => ({ number: x.number, name: l(x.name) })) ?? []}
                operations={ops}
                current={currentOp}
                selected={selectedOp}
                messages={messageCount}
                alarm={!!stoppedBy || chuckCollisions.length > 0}
                messageList={messagesList}
                preview={partThumb}
                onStock={() => setEditingStock(true)}
                onOffsets={() => setEditingOffsets(true)}
                onTools={() => setEditingTools(true)}
                onToolOffsets={() => setEditingToolOffsets(true)}
                onOperation={(k) => {
                  const op = ops[k]
                  if (!op) return
                  setSelectedOp(k === selectedOp ? -1 : k)
                  seek(op.start + 1e-6)
                }}
              />
              {programPanel(true)}
            </aside>
            <div className="splitter" role="separator" aria-orientation="vertical" aria-label={t('layout.resize')} title={t('layout.resize')} onPointerDown={(e) => startResize(e, 1)} />
            <section className="panel view">
              <AlarmLine alarm={stoppedBy} onGo={jumpToDiagnostic} />
              {stage}
              {player}
            </section>
          </main>
        ) : (
          // Machine screen: the control's display with its soft keys and MDI keys, over the operator panel
          <main className="machine-panel" style={{ '--code-w': `${codeWidth}px` } as CSSProperties}>
            <div className="mp-top">
              <div className="mp-display">
                <div className="mp-screen">
                  <AlarmLine alarm={stoppedBy} onGo={jumpToDiagnostic} />
                  <div className="cnc-title">
                    <b>{PAGE_TITLES[screen]}</b>
                    <span className="spacer" />
                    {mdiNotice && <span className="mdi-notice">{t('mdi.needEdit')}</span>}
                    <span className={`mode-box ${mode}`}>{mode === 'edit' ? 'EDIT' : 'MEM'}</span>
                    <span className={playing ? 'on' : ''}>{playing ? 'STRT' : sim.time > 0 && sim.time < (tl?.total ?? 0) ? 'HOLD' : '****'}</span>
                    {stoppedBy ? <span className="alm">ALM</span> : <span>***</span>}
                  </div>
                  {(screen === 'graph' || screen === 'prog') && (
                    <StatusHeader
                      move={move}
                      position={position}
                      machinePosition={machinePosition}
                      distanceToGo={toGo}
                      axes={shownAxes}
                      maxRpm={maxRpm}
                      maxLiveRpm={maxLiveRpm}
                      feedOverride={panel.feed}
                      rapidOverride={panel.rapid}
                      spindleOverride={panel.spindle}
                    />
                  )}
                  <div className={`mp-body ${screen === 'prog' ? 'full' : ''}`}>
                    {screen !== 'prog' && (
                      <section className="panel mp-page">
                        {screen === 'graph' ? (
                          stage
                        ) : (
                          <div className="mp-scroll">
                            {screen === 'pos' && (
                              <PositionAll
                                position={position}
                                machinePosition={machinePosition}
                                distanceToGo={toGo}
                                axes={shownAxes}
                                block={move ? t('position.blockValue', { line: move.line + 1, move: index + 1, total: moves.length }) : '—'}
                                runTime={formatTime(sim.time)}
                                cycleTime={formatTime(tl?.total ?? 0)}
                              />
                            )}
                            {screen === 'msg' && (
                              <>
                                {stoppedBy && (
                                  <div className="alarm-detail">
                                    <b>{stoppedBy.alarm?.code ?? t('severity.alarm')}</b>
                                    {stoppedBy.alarm?.message && <span className="machine-msg">{stoppedBy.alarm.message}</span>}
                                    <span>{t(`diag.${stoppedBy.code}`, stoppedBy.params)}</span>
                                    <button className="btn tiny" onClick={() => jumpToDiagnostic(stoppedBy)}>
                                      {t('alarm.line', { line: stoppedBy.line + 1 })} →
                                    </button>
                                  </div>
                                )}
                                {messagesBlock}
                              </>
                            )}
                            {screen === 'offset' && toolOffsetsBlock}
                            {screen === 'work' && offsetsBlock}
                            {screen === 'setting' && (
                              <>
                                {projectBlock}
                                {machineBlock}
                                {controlBlock}
                                {stockBlock}
                                {toolsBlock}
                              </>
                            )}
                          </div>
                        )}
                      </section>
                    )}
                    {screen !== 'prog' && (
                      <div className="splitter" role="separator" aria-orientation="vertical" aria-label={t('layout.resize')} title={t('layout.resize')} onPointerDown={(e) => startResize(e, -1)} />
                    )}
                    {programPanel(false, false)}
                  </div>
                </div>
                <SoftKeys group={groupOf(screen)} screen={screen} onScreen={setScreen} />
              </div>
              <MdiKeypad
                current={groupOf(screen)}
                onFunction={(k) => setScreen(GROUPS[k].page)}
                alarm={!!stoppedBy || chuckCollisions.length > 0}
                messages={messageCount}
                onReset={() => seek(0)}
                onStep={(n) => {
                  for (let k = 0; k < Math.abs(n); k++) step(n > 0 ? 1 : -1)
                }}
                onHelp={onHelp}
                onType={mdiType}
                onCancel={() => (mode === 'edit' ? editor.current?.backspace() : askEdit())}
                onDeleteBlock={() => (mode === 'edit' ? editor.current?.deleteLine() : askEdit())}
              />
            </div>
            <OperatorPanel
              mode={mode}
              onMode={(m) => (m === 'edit' ? startEdit() : runMem())}
              playing={playing}
              disabled={!result?.moves.length || mode === 'edit'}
              onCycleStart={() => {
                if (!playing) togglePlay()
              }}
              onFeedHold={() => {
                if (playing) togglePlay()
              }}
              panel={panel}
              onPanel={changePanel}
            />
            {simBar}
          </main>
        )
      }
      <footer className="status-bar">
        <span className={`file-kind ${projectPath ? 'project' : 'program'}`} title={t(projectPath ? 'file.projectHint' : 'file.programHint')}>
          {t(projectPath ? 'file.project' : 'file.program')}
        </span>
        <label title={t('status.machineHint')}>
          {t('header.machine')}
          <select value={machineId} onChange={(e) => changeMachine(e.target.value)}>
            {cfg.machines.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>
        <label>
          {t('header.control')}
          <select value={controlId} onChange={(e) => changeControl(e.target.value)}>
            {cfg.controls
              .filter((c) => c.machineType === machineKind || c.id === controlId)
              .map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
          </select>
        </label>
        <span title={t('status.toolsHint')}>
          {t('tools.title')}: {setup.tools ? l(setup.tools.name) : t('tools.none')}
        </span>
        {busy && <span className="busy">{t('sim.running')}</span>}
      </footer>
      {editingStock && machine && (
        <StockEditor
          stock={setup.stock}
          machineDefault={defaultSetup(machine, []).stock}
          lathe={machineKind === 'lathe'}
          fromProgram={programStock}
          workOffsets={Object.keys(setup.workOffsets)}
          onApply={applyStock}
          onClose={() => setEditingStock(false)}
        />
      )}
      {editingOffsets && machine && (
        <WorkOffsetsEditor
          stockOffset={setup.stock?.workOffset ?? 'G54'}
          offsets={setup.workOffsets}
          axes={machine.axes.filter((a) => a.type === 'linear' && ['X', 'Y', 'Z'].includes(a.name)).map((a) => a.name)}
          extended={machineKind === 'mill'}
          onApply={applyOffsets}
          onClose={() => setEditingOffsets(false)}
        />
      )}
      {editingToolOffsets && (
        <ToolOffsetsEditor
          offsets={setup.toolOffsets}
          measured={offsetsFor(setup.tools, machine)}
          lathe={lathe}
          onApply={applyToolOffsets}
          onClose={() => setEditingToolOffsets(false)}
        />
      )}
      {editingTools && (
        <ToolEditor
          tools={setup.tools}
          bundled={cfg.libraries}
          user={libraries.user}
          onSaveLibrary={libraries.save}
          onDeleteLibrary={libraries.remove}
          onApply={applyTools}
          onClose={() => setEditingTools(false)}
        />
      )}
    </div>
  )
}
