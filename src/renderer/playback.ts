import type { Move, ProgramPosition, SimulationResult, Vec3 } from '@core/index'

/** A finished simulation plus the cumulative time at the start of each move, for seeking. */
export interface Timeline {
  result: SimulationResult
  /** cumulative[k] = time when move k starts; the last entry is the total. */
  cumulative: number[]
  total: number
  /** File line → indices of the moves it produced. */
  movesByLine: Map<number, number[]>
}

export function buildTimeline(result: SimulationResult): Timeline {
  const cumulative = [0]
  const movesByLine = new Map<number, number[]>()
  let t = 0
  result.moves.forEach((m, i) => {
    t += m.durationS
    cumulative.push(t)
    const list = movesByLine.get(m.line)
    if (list) list.push(i)
    else movesByLine.set(m.line, [i])
  })
  return { result, cumulative, total: t, movesByLine }
}

/** Index of the move running at `time`, or -1 when there are no moves. */
export function moveAt(tl: Timeline, time: number): number {
  const n = tl.result.moves.length
  if (!n) return -1
  if (time >= tl.total) return n - 1
  let lo = 0
  let hi = n - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if ((tl.cumulative[mid] ?? 0) <= time) lo = mid
    else hi = mid - 1
  }
  return lo
}

export function fractionOf(tl: Timeline, index: number, time: number): number {
  const m = tl.result.moves[index]
  if (!m || m.durationS <= 0) return 1
  return Math.min(1, Math.max(0, (time - (tl.cumulative[index] ?? 0)) / m.durationS))
}

/** Point along the move's path (tool center when compensated) at a fraction of it. */
export function pointAlong(m: Move, f: number): Vec3 {
  const pts = m.toolCenter ?? m.points
  const n = pts.length - 1
  if (n <= 0) return pts[0] ?? [0, 0, 0]
  const x = Math.min(n, Math.max(0, f * n))
  const i = Math.min(n - 1, Math.floor(x))
  const r = x - i
  const a = pts[i] as Vec3
  const b = pts[i + 1] as Vec3
  return [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r, a[2] + (b[2] - a[2]) * r]
}

/** Program position between the previous move's end and this move's end. */
/** Position a fraction f along the move: absolute by default, or machine coordinates with pick. */
export function positionAlong(prev: Move | undefined, m: Move, f: number, pick: (m: Move) => ProgramPosition = (x) => x.position): ProgramPosition {
  if (!prev) return pick(m)
  const p = pick(prev)
  const q = pick(m)
  const mix = (a: number, b: number) => a + (b - a) * f
  return { X: mix(p.X, q.X), Y: mix(p.Y, q.Y), Z: mix(p.Z, q.Z), A: mix(p.A, q.A), B: mix(p.B, q.B), C: mix(p.C, q.C) }
}

export function formatTime(s: number): string {
  const v = Math.max(0, s)
  const m = Math.floor(v / 60)
  const r = Math.floor(v % 60)
  return `${m}:${String(r).padStart(2, '0')}`
}
