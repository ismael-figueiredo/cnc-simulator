// Lathe canned cycles as plain geometry: given the start point and, for the multiple repetitive
// cycles, the finishing contour, they return the passes the control makes. The interpreter turns
// each step into a move. Points are { x: radius, z } in the drawing frame.
import { NO_LENGTH } from '../tolerance'

export interface P2 {
  x: number
  z: number
}

/** One move of a cycle: rapid, cutting feed, or thread cutting (feed = lead per revolution). */
export interface Step {
  kind: 'rapid' | 'feed' | 'thread'
  to: P2
}

const EPS = NO_LENGTH

/** Z values where the polyline crosses x = level (each crossing once). */
function crossings(contour: P2[], level: number): number[] {
  const out: number[] = []
  for (let i = 0; i + 1 < contour.length; i++) {
    const a = contour[i] as P2
    const b = contour[i + 1] as P2
    const lo = Math.min(a.x, b.x)
    const hi = Math.max(a.x, b.x)
    if (level < lo - EPS || level > hi + EPS) continue
    if (Math.abs(b.x - a.x) < EPS) out.push(Math.max(a.z, b.z))
    else out.push(a.z + ((level - a.x) / (b.x - a.x)) * (b.z - a.z))
  }
  return out
}

const shifted = (contour: P2[], dx: number, dz: number) => contour.map((p) => ({ x: p.x + dx, z: p.z + dz }))

export interface RoughParams {
  /** Depth of cut per pass (radius), > 0. */
  depth: number
  /** Retract at the end of each pass, at 45°. */
  retract: number
  /** Finishing allowance: X as a radius (signed, like U/2) and Z (like W). */
  finishX: number
  finishZ: number
}

/**
 * G71 type I (stock removal in turning): passes parallel to Z, stepping in X by `depth` from the start
 * point toward the contour, each one ending where it meets the contour shifted by the allowance, with a
 * 45° retract; then one pass along the shifted contour and back to the start point.
 * Outside or inside work is told by where the start point is against the contour.
 */
export function roughTurn(start: P2, contour: P2[], p: RoughParams): Step[] {
  const c = shifted(contour, p.finishX, p.finishZ)
  const first = c[0]
  if (!first) return []
  const outside = start.x >= first.x
  const dir = outside ? -1 : 1
  const xs = c.map((q) => q.x)
  const limit = outside ? Math.min(...xs) : Math.max(...xs)
  const zEndOfContour = Math.min(...c.map((q) => q.z))
  const steps: Step[] = []
  for (let level = start.x + dir * p.depth; outside ? level > limit + EPS : level < limit - EPS; level += dir * p.depth) {
    // The pass runs from the start Z toward the chuck until the contour reaches this level
    const hits = crossings(c, level).filter((z) => z < start.z - EPS)
    const zEnd = hits.length ? Math.max(...hits) : zEndOfContour
    if (zEnd >= start.z - EPS) continue
    steps.push({ kind: 'rapid', to: { x: level, z: start.z } })
    steps.push({ kind: 'feed', to: { x: level, z: zEnd } })
    steps.push({ kind: 'feed', to: { x: level - dir * p.retract, z: zEnd + p.retract } })
    steps.push({ kind: 'rapid', to: { x: level - dir * p.retract, z: start.z } })
  }
  // Last roughing pass along the contour, leaving the allowance, then back to the start point
  steps.push({ kind: 'rapid', to: first })
  for (const q of c.slice(1)) steps.push({ kind: 'feed', to: q })
  const last = c[c.length - 1] as P2
  steps.push({ kind: 'rapid', to: { x: start.x, z: last.z } })
  steps.push({ kind: 'rapid', to: start })
  return steps
}

/** G72 (stock removal in facing): G71 with X and Z swapped, passes along X stepping in Z. */
export function roughFace(start: P2, contour: P2[], p: RoughParams): Step[] {
  const swap = (q: P2): P2 => ({ x: q.z, z: q.x })
  return roughTurn(swap(start), contour.map(swap), { depth: p.depth, retract: p.retract, finishX: p.finishZ, finishZ: p.finishX }).map((s) => ({
    kind: s.kind,
    to: swap(s.to)
  }))
}

export interface PatternParams {
  /** Total relief in X (radius) and Z, taken off in `count` passes. */
  reliefX: number
  reliefZ: number
  count: number
  finishX: number
  finishZ: number
}

/** G73 (pattern repeating): the contour is followed `count` times, each pass closer, ending at the allowance. */
export function patternRepeat(start: P2, contour: P2[], p: PatternParams): Step[] {
  const n = Math.max(1, Math.round(p.count))
  const steps: Step[] = []
  for (let k = 1; k <= n; k++) {
    const f = n === 1 ? 0 : (n - k) / (n - 1)
    const c = shifted(contour, p.finishX + p.reliefX * f, p.finishZ + p.reliefZ * f)
    const first = c[0]
    if (!first) break
    steps.push({ kind: 'rapid', to: first })
    for (const q of c.slice(1)) steps.push({ kind: 'feed', to: q })
    steps.push({ kind: 'rapid', to: start })
  }
  return steps
}

/**
 * G90/G77 (turning), G94/G79 (facing) and G92/G78 (threading) single cycles from start A to end B.
 * `taper` is the cone: in X (radius at the start minus at the end) for turning and threading, in Z for facing.
 */
export function singleCycle(kind: 'turn' | 'face' | 'thread', a: P2, b: P2, taper = 0): Step[] {
  if (kind === 'face')
    return [
      { kind: 'rapid', to: { x: a.x, z: b.z + taper } },
      { kind: 'feed', to: b },
      { kind: 'feed', to: { x: b.x, z: a.z } },
      { kind: 'rapid', to: a }
    ]
  const cut = kind === 'thread' ? 'thread' : 'feed'
  return [
    { kind: 'rapid', to: { x: b.x + taper, z: a.z } },
    { kind: cut, to: b },
    { kind: kind === 'thread' ? 'rapid' : 'feed', to: { x: a.x, z: b.z } },
    { kind: 'rapid', to: a }
  ]
}

export interface ThreadParams {
  /** Thread height (radius) and depth of the first pass. */
  height: number
  firstDepth: number
  /** Smallest depth increment and finishing allowance. */
  minDepth: number
  finish: number
  /** Finishing passes at full depth. */
  repeats: number
  /** Taper (radius at the start minus at the end). */
  taper: number
}

/**
 * G76 (multiple threading): passes at depth d·√n (constant chip area), never less than `minDepth` apart,
 * down to height − finish, then the finishing passes at full height. B is the thread root at its end.
 * Infeed is drawn radial.
 */
export function threadPasses(a: P2, b: P2, p: ThreadParams): Step[] {
  const dir = a.x >= b.x ? 1 : -1 // outside thread: the crest is above the root
  const depths: number[] = []
  const rough = Math.max(0, p.height - p.finish)
  let prev = 0
  for (let n = 1; prev < rough - EPS && n < 1000; n++) {
    let d = p.firstDepth * Math.sqrt(n)
    if (d - prev < p.minDepth) d = prev + p.minDepth
    prev = Math.min(d, rough)
    depths.push(prev)
  }
  for (let k = 0; k < Math.max(1, p.repeats); k++) depths.push(p.height)
  const steps: Step[] = []
  for (const d of depths) {
    const x = b.x + dir * (p.height - d)
    steps.push({ kind: 'rapid', to: { x: x + p.taper, z: a.z } })
    steps.push({ kind: 'thread', to: { x, z: b.z } })
    steps.push({ kind: 'rapid', to: { x: a.x, z: b.z } })
    steps.push({ kind: 'rapid', to: a })
  }
  return steps
}
