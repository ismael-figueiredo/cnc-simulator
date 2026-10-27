// What a measuring click can snap to on the cut part, as in CAD programs: corners, hole centers and
// edges of the shape the program left, worked out from the material removal models.
import type { Heightfield } from './removal'
import type { Hole } from './tooling'
import type { Vec3 } from './types'

export type SnapKind = 'vertex' | 'center' | 'edge' | 'path' | 'surface'

export interface Snap {
  point: Vec3
  kind: SnapKind
}

/** Points and segments a click may snap to, near where it landed. */
export interface Features {
  vertices: Vec3[]
  centers: Vec3[]
  edges: [Vec3, Vec3][]
}

export const NO_FEATURES: Features = { vertices: [], centers: [], edges: [] }

export const mergeFeatures = (...all: Features[]): Features => ({
  vertices: all.flatMap((f) => f.vertices),
  centers: all.flatMap((f) => f.centers),
  edges: all.flatMap((f) => f.edges)
})

// ---------- turned shape ----------

/** A point of a turned outline: Z along the axis, r the radius. */
export interface OutlinePoint {
  z: number
  r: number
}

/** Distance from p to the segment a–b in the (z, r) plane. */
function offLine(p: OutlinePoint, a: OutlinePoint, b: OutlinePoint): number {
  const dz = b.z - a.z
  const dr = b.r - a.r
  const len = Math.hypot(dz, dr)
  if (len === 0) return Math.hypot(p.z - a.z, p.r - a.r)
  return Math.abs(dz * (a.r - p.r) - dr * (a.z - p.z)) / len
}

/** Douglas–Peucker: the points of the outline that make its shape within `tol`. */
function simplify(points: OutlinePoint[], tol: number): OutlinePoint[] {
  if (points.length < 3) return points
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [i0, i1] = stack.pop() as [number, number]
    let worst = -1
    let at = -1
    for (let k = i0 + 1; k < i1; k++) {
      const d = offLine(points[k] as OutlinePoint, points[i0] as OutlinePoint, points[i1] as OutlinePoint)
      if (d > worst) {
        worst = d
        at = k
      }
    }
    if (worst > tol) {
      keep[at] = 1
      stack.push([i0, at], [at, i1])
    }
  }
  return points.filter((_, k) => keep[k])
}

/**
 * The turned outline from the face toward the chuck: radii sampled every `cell` mm from the face.
 * Its corners are the shoulders, chamfer ends and grooves of the part.
 */
export function turnedOutline(radii: ArrayLike<number>, face: number, cell: number, tol = 0.05): OutlinePoint[] {
  const points: OutlinePoint[] = []
  for (let i = 0; i < radii.length; i++) points.push({ z: face - i * cell, r: radii[i] ?? 0 })
  const outline = simplify(points, tol)
  // A shoulder falls between two samples: its wall is where the tool reached, the cut (smaller) one
  for (let k = 0; k + 1 < outline.length; k++) {
    const p = outline[k] as OutlinePoint
    const q = outline[k + 1] as OutlinePoint
    if (Math.abs(p.z - q.z) > cell * 1.01 || Math.abs(p.r - q.r) <= cell) continue
    if (p.r < q.r) q.z = p.z
    else p.z = q.z
  }
  return outline
}

/** Closer than this to the axis is on it (mm). */
const ON_AXIS = 0.25

/** The outline's corners and segments in 3D, on the half-plane at the angle of `around`, and the face center. */
export function turnedFeatures(outline: readonly OutlinePoint[], around: Vec3): Features {
  const a = Math.atan2(around[1], around[0])
  const at = (q: OutlinePoint): Vec3 => [q.r * Math.cos(a), q.r * Math.sin(a), q.z]
  // Rows faced off to the axis are no material: the part's face is where the radius first stands off it
  const k = outline.findIndex((q) => q.r > ON_AXIS)
  if (k < 0) return NO_FEATURES
  const first = outline[k] as OutlinePoint
  const faceZ = outline[k - 1]?.z ?? first.z
  // A corner on the axis is the face center itself
  const vertices = outline.filter((q) => q.r > ON_AXIS).map(at)
  const edges: [Vec3, Vec3][] = []
  for (let n = k; n + 1 < outline.length; n++) {
    const p = outline[n] as OutlinePoint
    const q = outline[n + 1] as OutlinePoint
    if (p.r > ON_AXIS || q.r > ON_AXIS) edges.push([at(p), at(q)])
  }
  // The face: from the axis out to the first radius
  edges.push([[0, 0, faceZ], at(first)])
  return { vertices, centers: [[0, 0, faceZ]], edges }
}

// ---------- milled surface ----------

export interface HeightfieldOptions {
  /** Height change between neighbor points that counts as a wall (mm). */
  step?: number
  /** Points a wall must run straight on both sides of a corner (staircase walls of a curve have none). */
  run?: number
}

/**
 * Edges and corners of the cut block near `around` (within `reach` mm): the top and bottom of every
 * wall, the block's own edges, and corners where two straight walls meet.
 */
export function heightfieldFeatures(h: Heightfield, around: Vec3, reach: number, { step = Math.max(0.2, h.cell * 1.5), run = 3 }: HeightfieldOptions = {}): Features {
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= h.nx || j >= h.ny ? h.bottom : (h.heights[j * h.nx + i] ?? h.top))
  const x = (i: number) => h.x0 + i * h.cell
  const y = (j: number) => h.y0 + j * h.cell
  const span = Math.ceil(reach / h.cell) + run + 1
  const ci = Math.round((around[0] - h.x0) / h.cell)
  const cj = Math.round((around[1] - h.y0) / h.cell)
  const i0 = Math.max(-1, ci - span)
  const i1 = Math.min(h.nx - 1, ci + span)
  const j0 = Math.max(-1, cj - span)
  const j1 = Math.min(h.ny - 1, cj + span)
  // A wall between (i, j) and its neighbor across X, or across Y
  const wallX = (i: number, j: number) => Math.abs(at(i, j) - at(i + 1, j)) > step
  const wallY = (i: number, j: number) => Math.abs(at(i, j) - at(i, j + 1)) > step
  // Outside the grid is the floor under the block: its sides are walls at the edge points themselves
  const edgeX = (i: number) => (i < 0 ? x(0) : i >= h.nx - 1 ? x(h.nx - 1) : x(i) + h.cell / 2)
  const edgeY = (j: number) => (j < 0 ? y(0) : j >= h.ny - 1 ? y(h.ny - 1) : y(j) + h.cell / 2)
  const clampI = (i: number) => Math.min(h.nx - 1, Math.max(0, i))
  const clampJ = (j: number) => Math.min(h.ny - 1, Math.max(0, j))

  const edges: [Vec3, Vec3][] = []
  const vertices: Vec3[] = []
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      if (wallX(i, j)) {
        const hi = Math.max(at(i, j), at(i + 1, j))
        const lo = Math.min(at(i, j), at(i + 1, j))
        const ya = y(clampJ(j)) - (j > 0 ? h.cell / 2 : 0)
        const yb = y(clampJ(j)) + (j < h.ny - 1 ? h.cell / 2 : 0)
        for (const z of [hi, lo]) edges.push([[edgeX(i), ya, z], [edgeX(i), yb, z]])
      }
      if (wallY(i, j)) {
        const hi = Math.max(at(i, j), at(i, j + 1))
        const lo = Math.min(at(i, j), at(i, j + 1))
        const xa = x(clampI(i)) - (i > 0 ? h.cell / 2 : 0)
        const xb = x(clampI(i)) + (i < h.nx - 1 ? h.cell / 2 : 0)
        for (const z of [hi, lo]) edges.push([[xa, edgeY(j), z], [xb, edgeY(j), z]])
      }
      // Corner at the meeting point of the four points (i, j) … (i + 1, j + 1): a straight wall across
      // X and one across Y both end or turn here
      const straightX = (dir: 1 | -1) => {
        for (let k = 0; k < run; k++) if (!wallX(i, j + (dir > 0 ? 1 + k : -k))) return false
        return true
      }
      const straightY = (dir: 1 | -1) => {
        for (let k = 0; k < run; k++) if (!wallY(i + (dir > 0 ? 1 + k : -k), j)) return false
        return true
      }
      if ((straightX(1) || straightX(-1)) && (straightY(1) || straightY(-1))) {
        const zs = [at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)]
        for (const z of [Math.max(...zs), Math.min(...zs)]) vertices.push([edgeX(i), edgeY(j), z])
      }
    }
  return { vertices, centers: [], edges }
}

// ---------- drilled holes ----------

const RIM_SEGMENTS = 48

/** Centers and rims of the drilled holes, at the surface they were drilled from. */
export function holeFeatures(holes: readonly Hole[], top: (x: number, y: number) => number): Features {
  const centers: Vec3[] = []
  const edges: [Vec3, Vec3][] = []
  for (const hole of holes) {
    const z = top(hole.x + hole.radius * 1.5, hole.y)
    centers.push([hole.x, hole.y, z])
    for (let k = 0; k < RIM_SEGMENTS; k++) {
      const a0 = (k / RIM_SEGMENTS) * Math.PI * 2
      const a1 = ((k + 1) / RIM_SEGMENTS) * Math.PI * 2
      edges.push([
        [hole.x + Math.cos(a0) * hole.radius, hole.y + Math.sin(a0) * hole.radius, z],
        [hole.x + Math.cos(a1) * hole.radius, hole.y + Math.sin(a1) * hole.radius, z]
      ])
    }
  }
  return { vertices: [], centers, edges }
}

// ---------- the snap itself ----------

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

/** Nearest point to p on the segment a–b. */
export function closestOnSegment(p: Vec3, a: Vec3, b: Vec3): Vec3 {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const len2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2]
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / len2)) : 0
  return [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t]
}

const nearest = (p: Vec3, points: readonly Vec3[]) => {
  let best: Vec3 | null = null
  let bestD = Infinity
  for (const q of points) {
    const d = dist(p, q)
    if (d < bestD) {
      bestD = d
      best = q
    }
  }
  return best ? { point: best, d: bestD } : null
}

/**
 * The point a click at p snaps to, as in CAD programs: a corner or a hole center within `tol`, else
 * the nearest edge within `tol`, else a path point, else the surface where it landed.
 */
export function snapToFeatures(p: Vec3, f: Features, tol: number, path: readonly Vec3[] = []): Snap {
  const vertex = nearest(p, f.vertices)
  if (vertex && vertex.d <= tol) return { point: vertex.point, kind: 'vertex' }
  const center = nearest(p, f.centers)
  if (center && center.d <= tol) return { point: center.point, kind: 'center' }
  const edge = nearest(
    p,
    f.edges.map(([a, b]) => closestOnSegment(p, a, b))
  )
  if (edge && edge.d <= tol) return { point: edge.point, kind: 'edge' }
  const onPath = nearest(p, path)
  if (onPath && onPath.d <= tol) return { point: onPath.point, kind: 'path' }
  return { point: p, kind: 'surface' }
}
