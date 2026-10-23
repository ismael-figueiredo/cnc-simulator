// Tool and holder geometry for the 3D view, and a holder-versus-stock check.
// Pure functions: the renderer draws what they return and the tests check it.
import type { Stock } from './config/project'
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
  return holder?.orientation === 'radial' ? 'radial' : 'axial'
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
