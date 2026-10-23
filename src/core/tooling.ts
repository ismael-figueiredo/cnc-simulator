// Tool and holder geometry for the 3D view, and a holder-versus-stock check.
// Pure functions: the renderer draws what they return and the tests check it.
import type { Stock } from './config/project'
import { stockOrigin } from './removal'
import type { Holder, Tool, ToolLibrary } from './config/schema'
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
  if (tool.type === 'grooving') {
    const w = Math.max(tool.diameter, 1)
    pts = [[0, 0], [0, w], [size, w], [size, 0]]
  } else {
    const shape = tool.insert ?? DEFAULT_INSERT[tool.type] ?? 'C'
    const corner = { C: 80, D: 55, V: 35, W: 80, T: 60, S: 90, R: 0 }[shape]
    if (shape === 'R') {
      // Round insert: the circle passes through the origin, centered on the bisector
      const r = size / 2
      const c = r / Math.SQRT2
      pts = Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * 2 * Math.PI
        return [c + r * Math.cos(a), c + r * Math.sin(a)] as [number, number]
      })
    } else {
      // Edges leave the corner symmetric about the 45° bisector
      const h = (corner * Math.PI) / 360
      const e1: [number, number] = [size * Math.cos(Math.PI / 4 - h), size * Math.sin(Math.PI / 4 - h)]
      const e2: [number, number] = [size * Math.cos(Math.PI / 4 + h), size * Math.sin(Math.PI / 4 + h)]
      pts = shape === 'T' || shape === 'W' ? [[0, 0], e1, e2] : [[0, 0], e1, [e1[0] + e2[0], e1[1] + e2[1]], e2]
    }
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
    const sx = s.x ?? 100
    const sy = s.y ?? 80
    const inside = x > o[0] - hr && x < o[0] + sx + hr && y > o[1] - hr && y < o[1] + sy + hr
    return inside ? o[2] - (z + length) : 0
  }
  // Cylinder (bar): face at o.z, body toward -Z
  const R = (s.diameter ?? 50) / 2
  const L = s.length ?? 30
  const r = Math.hypot(x - o[0], y - o[1])
  if (mount === 'radial') {
    // Radial tool: the holder nose is `length` out from the tip, toward +r
    const inBar = z < o[2] + hr && z > o[2] - L - hr
    return inBar ? R - (r + length) : 0
  }
  return r < R + hr ? o[2] - (z + length) : 0
}

/** Three-jaw chuck around the bar: jaws grip the last part of the stock, the body sits behind them. */
export interface ChuckGeometry {
  /** Z of the chuck face (jaws start here and reach `grip` mm toward the part face). */
  face: number
  grip: number
  barRadius: number
  /** Outer radius of the jaws and of the chuck body. */
  jawOuter: number
  bodyRadius: number
}

export function chuckGeometry(s: Stock, zero: Vec3): ChuckGeometry {
  const o = stockOrigin(s, zero)
  const R = (s.diameter ?? 50) / 2
  const L = s.length ?? 30
  const grip = Math.min(L * 0.4, 25)
  const jaw = Math.min(30, Math.max(12, R * 0.6))
  // The bar ends at the chuck face; the jaws hold its last `grip` mm
  return { face: o[2] - L, grip, barRadius: R, jawOuter: R + jaw, bodyRadius: R + jaw + 18 }
}

export interface ChuckCollision {
  moveIndex: number
  line: number
  tool: number
  /** Z where the tool reaches the jaws or the chuck body. */
  z: number
}

/**
 * Tool tip against the chuck: inside the jaws' reach over the gripped length, or past the chuck face.
 * Jaw angles are not followed, so these are possible collisions, one per tool and block.
 */
export function findChuckCollisions(moves: readonly Move[], s: Stock | null, zero: Vec3): ChuckCollision[] {
  if (s?.shape !== 'cylinder') return []
  const c = chuckGeometry(s, zero)
  const out: ChuckCollision[] = []
  const seen = new Set<string>()
  moves.forEach((m, k) => {
    if (m.kind === 'dwell') return
    for (const [x, y, z] of m.points.slice(1)) {
      const r = Math.hypot(x, y)
      // Near the axis (drills, bores) the tool works inside the bar, clear of the jaws
      const jaws = z < c.face + c.grip && r < c.jawOuter + m.toolRadius && r + m.toolRadius > c.barRadius * 0.5
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
