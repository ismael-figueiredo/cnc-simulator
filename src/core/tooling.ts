// Tool and holder geometry for the 3D view, and a holder-versus-stock check.
// Pure functions: the renderer draws what they return and the tests check it.
import { stockSize, type Stock, type ToolOffsets } from './config/project'
import { stockOrigin } from './removal'
import type { Holder, Machine, Tool, ToolLibrary } from './config/schema'
import type { Move, Vec3 } from './types'

/** How the tool sits: along Z (mill spindle, lathe axial), along X (lathe radial), or a turning tool. */
export type ToolMount = 'axial' | 'radial' | 'turning'

const TURNING_TYPES = new Set<Tool['type']>(['turning-insert', 'grooving', 'threading', 'boring-bar'])

/** Used when a tool has no holder: a BT40 taper with an ER32 collet on mills, an ER20 driven holder on lathes. */
export const GENERIC_HOLDERS: Record<'mill' | 'lathe', Holder> = {
  mill: { id: 'generic-bt40', name: 'BT40', standard: 'BT40', profile: [[31.75, 0], [31.75, 27], [25, 27], [25, 60], [20, 60], [20, 75]] },
  lathe: { id: 'generic-er20', name: 'ER20', standard: 'ER', driven: true, orientation: 'axial', profile: [[17, 0], [17, 30], [11, 30], [11, 50]] }
}

export function toolMount(tool: Tool, holder: Holder | undefined, lathe: boolean): ToolMount {
  if (!lathe) return 'axial'
  if (TURNING_TYPES.has(tool.type)) return 'turning'
  return (tool.mount ?? holder?.orientation) === 'radial' ? 'radial' : 'axial'
}

export const isTurningTool = (tool: Tool) => TURNING_TYPES.has(tool.type)

/** Default insert for each turning tool type. */
const DEFAULT_INSERT: Partial<Record<Tool['type'], NonNullable<Tool['insert']>>> = { 'turning-insert': 'C', threading: 'T', 'boring-bar': 'C' }

/**
 * Top view of the insert, in mm: the cutting corner at the origin, the body in the +x/+y quadrant
 * (x = toward +X, y = toward +Z) for a right-hand external tool; left hand mirrors y, internal mirrors x.
 * Grooving inserts are a blade of the tool's diameter (its width).
 */
export function insertOutline(tool: Tool, size = 12): [number, number][] {
  let pts: [number, number][]
  const shape = tool.insert ?? DEFAULT_INSERT[tool.type] ?? 'C'
  if (tool.type === 'grooving') {
    const w = Math.max(tool.diameter, 1)
    pts = [[0, 0], [0, w], [size, w], [size, 0]]
  } else if (tool.type === 'threading' && shape === 'T') {
    // Laydown thread insert: an equilateral triangle, its 60° point square to the axis (toward -X)
    const h = (size * Math.sqrt(3)) / 2
    pts = [[0, 0], [h, -size / 2], [h, size / 2]]
  } else if (shape === 'R') {
    // Round insert: the circle passes through the origin, centered on the bisector
    const r = size / 2
    const c = r / Math.SQRT2
    pts = Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * 2 * Math.PI
      return [c + r * Math.cos(a), c + r * Math.sin(a)] as [number, number]
    })
  } else if (shape === 'W') {
    // Trigon: three 80° corners joined by edges bent 160° in the middle
    pts = [[0, 0]]
    let dir = Math.PI / 4 - (40 * Math.PI) / 180
    for (let k = 0; k < 6; k++) {
      const last = pts[pts.length - 1] ?? [0, 0]
      pts.push([last[0] + (size / 2) * Math.cos(dir), last[1] + (size / 2) * Math.sin(dir)])
      dir += ((k % 2 ? 100 : 20) * Math.PI) / 180
    }
    pts.pop()
  } else {
    const corner = { C: 80, D: 55, V: 35, T: 60, S: 90 }[shape]
    // Edges leave the corner symmetric about the 45° bisector
    const h = (corner * Math.PI) / 360
    const e1: [number, number] = [size * Math.cos(Math.PI / 4 - h), size * Math.sin(Math.PI / 4 - h)]
    const e2: [number, number] = [size * Math.cos(Math.PI / 4 + h), size * Math.sin(Math.PI / 4 + h)]
    pts = shape === 'T' ? [[0, 0], e1, e2] : [[0, 0], e1, [e1[0] + e2[0], e1[1] + e2[1]], e2]
  }
  const sx = tool.side === 'internal' ? -1 : 1
  const sy = tool.hand === 'left' ? -1 : 1
  return pts.map(([x, y]) => [x * sx, y * sy])
}

export function holderOf(tool: Tool, library: ToolLibrary | null, lathe: boolean): Holder | undefined {
  const own = tool.holder ? library?.holders.find((h) => h.id === tool.holder) : undefined
  if (own?.profile?.length) return own
  return TURNING_TYPES.has(tool.type) && lathe ? undefined : GENERIC_HOLDERS[lathe ? 'lathe' : 'mill']
}

/** Outline [radius, height] from the tip (height 0) up, for a solid of revolution. */
export type Outline = [number, number][]

/** Cutting end and shank: the shape depends on the tool type. */
export function toolOutline(tool: Tool): Outline {
  const R = Math.max(tool.diameter / 2, 0.25)
  const L = Math.max(tool.length, 1)
  const flute = Math.min(tool.fluteLength ?? L * 0.45, L)
  const tip: Outline = [[0, 0]]
  switch (tool.type) {
    case 'ball-endmill':
      for (let i = 1; i <= 8; i++) {
        const a = (i / 8) * (Math.PI / 2)
        tip.push([R * Math.sin(a), R * (1 - Math.cos(a))])
      }
      break
    case 'bull-endmill': {
      const cr = Math.min(tool.cornerRadius ?? R * 0.2, R)
      tip.push([R - cr, 0])
      for (let i = 1; i <= 6; i++) {
        const a = (i / 6) * (Math.PI / 2)
        tip.push([R - cr + cr * Math.sin(a), cr * (1 - Math.cos(a))])
      }
      break
    }
    case 'drill':
      tip.push([R, R * 0.6]) // 118° point
      break
    case 'chamfer-mill':
      tip.push([R * 0.15, 0], [R, R * 0.85]) // 90° chamfer
      break
    case 'tap':
      tip.push([R * 0.75, 0], [R, R * 0.3])
      break
    default:
      tip.push([R, 0])
  }
  // Shank a little thinner than the flutes, up to the holder nose
  return [...tip, [R, flute], [R * 0.92, flute], [R * 0.92, L]]
}

/** The holder above the tool: its profile runs from the spindle face toward the nose, so it is flipped here. */
export function holderOutline(holder: Holder, toolLength: number): Outline {
  const profile = holder.profile ?? []
  const nose = Math.max(...profile.map(([, l]) => l), 0)
  return [...profile].reverse().map(([r, l]) => [r, toolLength + (nose - l)])
}

/** Taper shanks: gauge diameter at the flange, taper length, and whether a pull stud closes it. */
const TAPERS: Partial<Record<Holder['standard'], { gauge: number; length: number; stud: boolean }>> = {
  BT30: { gauge: 31.75, length: 48.4, stud: true },
  BT40: { gauge: 44.45, length: 65.4, stud: true },
  BT50: { gauge: 69.85, length: 101.8, stud: true },
  CAT40: { gauge: 44.45, length: 68.25, stud: true },
  SK40: { gauge: 44.45, length: 68.4, stud: true },
  HSK63A: { gauge: 48, length: 32, stud: false },
  HSK100A: { gauge: 75, length: 50, stud: false }
}

/**
 * The holder as drawn: its profile (see holderOutline) with the V-groove in the flange, the 7:24 taper
 * and pull stud above it (or the short HSK taper), and a chamfered collet nut on ER holders.
 * Drawing only: the checks use the plain profile.
 */
export function holderDrawing(holder: Holder, toolLength: number): Outline {
  const out = holderOutline(holder, toolLength)
  if (out.length < 2) return out
  // Collet nut: chamfer its lower edge
  const [nr, nh] = out[0] ?? [0, 0]
  const [, nh2] = out[1] ?? [0, 0]
  if (/er\d/i.test(holder.id) && nr > 0) {
    const c = Math.min(nr * 0.12, (nh2 - nh) * 0.4)
    out.splice(0, 1, [nr - c, nh], [nr, nh + c])
  }
  const taper = TAPERS[holder.standard]
  if (!taper) return out
  const top = out[out.length - 1]?.[1] ?? toolLength
  // Flange: the widest step reaching the spindle face; its V-groove (60°) is cut in the middle
  const rf = Math.max(...out.map(([r]) => r))
  const k = out.findIndex(([r]) => r === rf)
  const bottom = out[k]?.[1] ?? top
  if (taper.stud && top - bottom > 10) {
    const mid = (top + bottom) / 2
    const depth = Math.min(5, rf * 0.15)
    const half = depth * Math.tan(Math.PI / 6)
    out.splice(k + 1, 0, [rf, mid - half - 2], [rf - depth, mid - half], [rf - depth, mid + half], [rf, mid + half + 2])
  }
  const end = taper.gauge / 2 - (taper.length * 7) / 48
  out.push([taper.gauge / 2, top], [taper.stud ? end : taper.gauge / 2 - 1, top + taper.length])
  if (taper.stud) {
    const r = taper.gauge * 0.17
    out.push([r, top + taper.length], [r, top + taper.length + taper.gauge * 0.35], [r * 1.35, top + taper.length + taper.gauge * 0.35], [r * 1.35, top + taper.length + taper.gauge * 0.55], [r * 0.6, top + taper.length + taper.gauge * 0.62])
  }
  out.push([0, out[out.length - 1]?.[1] ?? top])
  return out
}

/** Radius of the holder where it meets the tool (the part that touches the stock first). */
export const noseRadius = (holder: Holder) => {
  const p = holder.profile ?? []
  const nose = Math.max(...p.map(([, l]) => l), 0)
  return Math.min(...p.filter(([, l]) => l === nose).map(([r]) => r), Infinity)
}

export interface HolderCollision {
  moveIndex: number
  line: number
  tool: number
  /** How far the holder nose goes into the stock, in mm. */
  depth: number
}

export interface CollisionInput {
  moves: Move[]
  tools: ToolLibrary | null
  stock: Stock | null
  /** Scene position of the stock's work offset zero (see workShift). */
  stockZero: Vec3
  lathe: boolean
}

/**
 * Holder against the raw stock. Material removal is not simulated, so a deep pocket wider than the
 * holder may be flagged too: these are possible collisions to check, one per tool and block.
 */
export function findHolderCollisions({ moves, tools, stock, stockZero, lathe }: CollisionInput): HolderCollision[] {
  if (!stock || !tools?.tools.length) return []
  const byNumber = new Map(tools.tools.map((t) => [t.number, t]))
  const o: Vec3 = [stockZero[0] + (stock.offset?.X ?? 0), stockZero[1] + (stock.offset?.Y ?? 0), stockZero[2] + (stock.offset?.Z ?? 0)]
  const out: HolderCollision[] = []
  const seen = new Set<string>()

  moves.forEach((m, k) => {
    if (m.kind === 'dwell') return
    const tool = byNumber.get(m.state.tool)
    if (!tool) return
    const holder = holderOf(tool, tools, lathe)
    if (!holder) return
    const mount = toolMount(tool, holder, lathe)
    if (mount === 'turning') return
    const hr = noseRadius(holder)
    let worst = 0
    // The first point is where the previous move ended: already checked there
    for (const p of (m.toolCenter ?? m.points).slice(1)) {
      const d = intrusion(p, mount, tool.length, hr, stock, o)
      if (d > worst) worst = d
    }
    if (worst <= 1e-6) return
    const key = `${tool.number}|${m.line}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ moveIndex: k, line: m.line, tool: tool.number, depth: Math.round(worst * 1000) / 1000 })
  })
  return out
}

/** Depth of the holder nose inside the stock for a tool tip at p (0 when clear). */
function intrusion(p: Vec3, mount: ToolMount, length: number, hr: number, s: Stock, o: Vec3): number {
  const [x, y, z] = p
  if (s.shape === 'block') {
    // Block: top face at o.z; the holder nose is `length` above the tip
    const { x: sx, y: sy } = stockSize(s)
    const inside = x > o[0] - hr && x < o[0] + sx + hr && y > o[1] - hr && y < o[1] + sy + hr
    return inside ? o[2] - (z + length) : 0
  }
  // Cylinder (bar): face at o.z, body toward -Z
  const { diameter, length: L } = stockSize(s)
  const R = diameter / 2
  const r = Math.hypot(x - o[0], y - o[1])
  if (mount === 'radial') {
    // Radial tool: the holder nose is `length` out from the tip, toward +r
    const inBar = z < o[2] + hr && z > o[2] - L - hr
    return inBar ? R - (r + length) : 0
  }
  return r < R + hr ? o[2] - (z + length) : 0
}

/** Chuck around the bar: jaws grip the last part of the stock, the body sits behind them. */
export interface ChuckGeometry {
  /** Z of the chuck face (jaws start here and reach `grip` mm toward the part face). */
  face: number
  grip: number
  barRadius: number
  /** Outer radius of the jaws and of the chuck body. Stepped jaws: the gripping step is `grip` long and
   * reaches `jawStep`; the rest of the jaw, out to `jawOuter`, is `JAW_BASE` × `grip` long. */
  jawStep: number
  jawOuter: number
  bodyRadius: number
  /** Body depth behind the face, along the spindle axis. */
  bodyLength: number
  jaws: number
  jawWidth: number
  boreRadius: number
}

/** Axial length of the jaws' outer step, as a fraction of the grip. */
export const JAW_BASE = 0.65

/** The machine's chuck (`chuck` in its JSON) around the stock, or one sized from the bar without it. */
export function chuckGeometry(s: Stock, zero: Vec3, chuck?: Machine['chuck']): ChuckGeometry {
  const o = stockOrigin(s, zero)
  const { diameter, length: L } = stockSize(s)
  const R = diameter / 2
  const grip = Math.min(L * 0.4, chuck?.jawLength ?? 25)
  const jaw = chuck?.jawHeight ?? Math.min(30, Math.max(12, R * 0.6))
  // A bar wider than the chuck still gets a body a little wider than itself
  const bodyRadius = chuck ? Math.max(chuck.diameter / 2, R + 10) : R + jaw + 18
  // The bar ends at the chuck face; the jaws hold its last `grip` mm
  return {
    face: o[2] - L,
    grip,
    barRadius: R,
    jawStep: R + jaw * 0.35,
    jawOuter: R + jaw,
    bodyRadius,
    bodyLength: chuck?.length ?? Math.max(50, bodyRadius * 0.8),
    jaws: chuck?.jaws ?? 3,
    jawWidth: chuck?.jawWidth ?? Math.max(16, bodyRadius * 0.24),
    boreRadius: (chuck?.bore ?? bodyRadius * 0.45) / 2
  }
}

export interface ChuckCollision {
  moveIndex: number
  line: number
  tool: number
  /** Z where the tool reaches the jaws or the chuck body (or the tailstock center). */
  z: number
  /** What the tool reaches; absent: the chuck. */
  part?: 'tailstock'
}

/**
 * Tool tip against the chuck: inside the jaws' reach over the gripped length, or past the chuck face.
 * Jaw angles are not followed, so these are possible collisions, one per tool and block.
 */
export function findChuckCollisions(moves: readonly Move[], s: Stock | null, zero: Vec3, chuck?: Machine['chuck']): ChuckCollision[] {
  if (s?.shape !== 'cylinder') return []
  const c = chuckGeometry(s, zero, chuck)
  const out: ChuckCollision[] = []
  const seen = new Set<string>()
  moves.forEach((m, k) => {
    if (m.kind === 'dwell') return
    for (const [x, y, z] of m.points.slice(1)) {
      const r = Math.hypot(x, y)
      // Near the axis (drills, bores) the tool works inside the bar, clear of the jaws
      const reach = r - m.toolRadius
      const jaws =
        r + m.toolRadius > c.barRadius * 0.5 &&
        ((z < c.face + c.grip && reach < c.jawStep) || (z < c.face + c.grip * JAW_BASE && reach < c.jawOuter))
      const body = z < c.face && r < c.bodyRadius + m.toolRadius
      if (!jaws && !body) continue
      const key = `${m.state.tool}|${m.line}`
      if (!seen.has(key)) {
        seen.add(key)
        out.push({ moveIndex: k, line: m.line, tool: m.state.tool, z: Math.round(z * 1000) / 1000 })
      }
      return
    }
  })
  return out
}

/** Tailstock live center at the bar's face: a 60° point, its bearing housing and the quill behind it. */
export interface TailstockGeometry {
  /** Z of the center's point when it is against the part. */
  tip: number
  /** How far it backs off when retracted. */
  retract: number
  /** Length of the 60° point; the bearing housing behind it is wider. */
  pointLength: number
  housingRadius: number
  housingLength: number
  quillRadius: number
}

/** Included angle of a lathe center: 60°, so the point widens by tan 30° per mm. */
const CENTER_SLOPE = Math.tan(Math.PI / 6)

export function tailstockGeometry(s: Stock, zero: Vec3, tailstock: NonNullable<Machine['tailstock']>): TailstockGeometry {
  const o = stockOrigin(s, zero)
  const quillRadius = tailstock.quillDiameter / 2
  const housingRadius = quillRadius * 0.6
  return {
    tip: o[2],
    retract: tailstock.retract ?? 80,
    pointLength: (quillRadius * 0.25) / CENTER_SLOPE,
    housingRadius,
    housingLength: quillRadius * 0.9,
    quillRadius
  }
}

/** Radius of the center (point, housing, quill) at a distance d past its tip. */
function centerRadius(t: TailstockGeometry, d: number): number {
  if (d < t.pointLength) return d * CENTER_SLOPE
  return d < t.pointLength + t.housingLength ? t.housingRadius : t.quillRadius
}

/**
 * Tool tip against the tailstock center while it is against the part (moves after M27). The point
 * sits in a center hole about 2 mm deep, so facing down to the axis reaches it too.
 */
export function findTailstockCollisions(moves: readonly Move[], s: Stock | null, zero: Vec3, tailstock: Machine['tailstock']): ChuckCollision[] {
  if (s?.shape !== 'cylinder' || !tailstock) return []
  const t = tailstockGeometry(s, zero, tailstock)
  const HOLE = 2
  const out: ChuckCollision[] = []
  const seen = new Set<string>()
  moves.forEach((m, k) => {
    if (m.kind === 'dwell' || !m.state.tailstock) return
    for (const [x, y, z] of m.points.slice(1)) {
      const d = z - (t.tip - HOLE)
      if (d < 0 || Math.hypot(x, y) - m.toolRadius >= Math.max(centerRadius(t, d), 0.5)) continue
      const key = `${m.state.tool}|${m.line}`
      if (!seen.has(key)) {
        seen.add(key)
        out.push({ moveIndex: k, line: m.line, tool: m.state.tool, z: Math.round(z * 1000) / 1000, part: 'tailstock' })
      }
      return
    }
  })
  return out
}

/** Spindle gauge line to tool tip: the holder from the spindle face to its nose, plus the tool. */
export function gaugeLength(tool: Tool, holder: Holder | undefined): number {
  const nose = Math.max(0, ...(holder?.profile ?? []).map(([, l]) => l))
  return tool.length + nose
}

/**
 * The offset table a machine would have with these tools measured: on machining centers the
 * gauge length (H) and the radius (D) under each tool's offset number; on lathes the nose radius and
 * tip direction of turning tools, with geometry and wear at zero.
 */
export function defaultToolOffsets(library: ToolLibrary | null, lathe: boolean): ToolOffsets {
  const out: ToolOffsets = {}
  for (const t of library?.tools ?? []) {
    const n = String(t.offset ?? t.number)
    if (!lathe) out[n] = { length: Math.round(gaugeLength(t, holderOf(t, library, false)) * 1000) / 1000, radius: t.diameter / 2 }
    else if (isTurningTool(t)) out[n] = { x: 0, z: 0, nose: t.cornerRadius ?? t.diameter / 2, tip: t.tipDirection ?? 3 }
    else out[n] = { x: 0, z: 0 }
  }
  return out
}

/** A hole made by a drilling cycle: a straight plunge at one X/Y, drawn as a real cylinder. */
export interface Hole {
  x: number
  y: number
  radius: number
  /** Deepest Z the tool reached. */
  bottom: number
  /** Move that finishes the hole (its deepest plunge): the hole is drawn once playback passes it. */
  last: number
}

const SAME = 1e-6

/**
 * Holes of the drilling cycles (G73, G74, G76, G81–G89): their feed moves go straight down at one
 * X/Y. Pecks at the same spot are one hole. Plain plunges outside a cycle are left out (an end mill
 * entering a pocket is not a hole).
 */
export function holesOf(moves: readonly Move[]): Hole[] {
  const out: Hole[] = []
  moves.forEach((m, i) => {
    if (m.kind !== 'feed' || !m.state.cycle || m.toolRadius <= 0) return
    const a = m.points[0]
    const b = m.points[m.points.length - 1]
    if (!a || !b || Math.abs(a[0] - b[0]) > SAME || Math.abs(a[1] - b[1]) > SAME || b[2] >= a[2]) return
    const prev = out[out.length - 1]
    if (prev && Math.abs(prev.x - b[0]) < SAME && Math.abs(prev.y - b[1]) < SAME && Math.abs(prev.radius - m.toolRadius) < SAME) {
      if (b[2] < prev.bottom) {
        prev.bottom = b[2]
        prev.last = i
      }
      return
    }
    out.push({ x: b[0], y: b[1], radius: m.toolRadius, bottom: b[2], last: i })
  })
  return out
}
