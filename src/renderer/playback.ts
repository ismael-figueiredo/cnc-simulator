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

/** Panel overrides as fractions (1 = 100 %): cutting feed and rapid traverse. */
export interface Overrides {
  feed: number
  rapid: number
}
export const NO_OVERRIDE: Overrides = { feed: 1, rapid: 1 }

/** Times follow the overrides, as the machine's cycle time does (dwells are not affected). */
export function buildTimeline(result: SimulationResult, overrides: Overrides = NO_OVERRIDE): Timeline {
  const cumulative = [0]
  const movesByLine = new Map<number, number[]>()
  let t = 0
  result.moves.forEach((m, i) => {
    t += m.kind === 'rapid' ? m.durationS / overrides.rapid : m.kind === 'feed' ? m.durationS / overrides.feed : m.durationS
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

/** The same point of the program on another timeline (same move, same fraction of it). */
export function sameMoment(from: Timeline, to: Timeline, time: number): number {
  if (time <= 0) return 0
  if (time >= from.total) return to.total
  const k = moveAt(from, time)
  const f = fractionOf(from, k, time)
  const start = to.cumulative[k] ?? 0
  return start + ((to.cumulative[k + 1] ?? start) - start) * f
}

export interface StopOptions {
  /** M01 stops the run (OPTIONAL STOP on). */
  optionalStop: boolean
  /** Lines with a breakpoint: the run stops before each of them. */
  breakpoints: ReadonlySet<number>
}

/**
 * Times where playback stops by itself: M00 always, M01 with OPTIONAL STOP, and the start of every
 * execution of a block with a breakpoint. Sorted.
 */
export function stopTimes(tl: Timeline, o: StopOptions): number[] {
  const out = new Set<number>()
  for (const d of tl.result.diagnostics) {
    if (d.moveIndex === undefined) continue
    if (d.code === 'program-stop' || (o.optionalStop && d.code === 'optional-stop')) out.add(tl.cumulative[d.moveIndex] ?? tl.total)
  }
  const moves = tl.result.moves
  for (const line of o.breakpoints)
    for (const k of tl.movesByLine.get(line) ?? []) if (k === 0 || moves[k - 1]?.line !== line) out.add(tl.cumulative[k] ?? 0)
  return [...out].sort((a, b) => a - b)
}

/** Single block: the end of the block running at `time` (where the next one starts). */
export function blockEnd(tl: Timeline, time: number): number {
  const moves = tl.result.moves
  let k = moveAt(tl, time)
  if (k < 0) return tl.total
  // Exactly at the end of a move, the next block is the one about to run
  if (time >= (tl.cumulative[k + 1] ?? tl.total) - 1e-9) k++
  const line = moves[k]?.line
  while (k + 1 < moves.length && moves[k + 1]?.line === line) k++
  return tl.cumulative[k + 1] ?? tl.total
}

/** First stop strictly after `time`, or the end. */
export function nextStop(stops: number[], time: number, total: number): number {
  for (const s of stops) if (s > time + 1e-9) return s
  return total
}

/**
 * DISTANCE TO GO of the control's POSITION screen: from where the tool is to the end of the block
 * being run (a block can make several moves, such as a canned cycle).
 */
export function distanceToGo(moves: readonly Move[], index: number, position: ProgramPosition): ProgramPosition | undefined {
  let k = index
  const line = moves[k]?.line
  if (line === undefined) return undefined
  while (k + 1 < moves.length && moves[k + 1]?.line === line) k++
  const end = (moves[k] as Move).position
  return { X: end.X - position.X, Y: end.Y - position.Y, Z: end.Z - position.Z, A: end.A - position.A, B: end.B - position.B, C: end.C - position.C }
}
