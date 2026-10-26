import { describe, expect, it } from 'vitest'
import type { Diagnostic, Move, SimulationResult } from '../src/core'
import { blockEnd, buildTimeline, distanceToGo, operations, overrideFactor, nextStop, sameMoment, stopTimes } from '../src/renderer/playback'

/** Moves as [line, kind, seconds]; only what the timeline reads. */
const result = (moves: [number, Move['kind'], number][], diagnostics: Partial<Diagnostic>[] = []): SimulationResult =>
  ({
    moves: moves.map(([line, kind, durationS]) => ({ line, kind, durationS, state: { feedPerMinute: true } })) as Move[],
    diagnostics: diagnostics as Diagnostic[],
    finished: true,
    totalTimeS: 0,
    tools: [],
    variables: []
  })

// Line 1: rapid 2 s · line 2: two feeds of 3 s · M01 at line 3 · line 4: feed 4 s
const r = result(
  [
    [1, 'rapid', 2],
    [2, 'feed', 3],
    [2, 'feed', 3],
    [4, 'feed', 4]
  ],
  [{ code: 'optional-stop', moveIndex: 3 }, { code: 'program-stop', moveIndex: 1 }]
)

describe('playback stops', () => {
  const tl = buildTimeline(r)

  it('stops at M00 always and at M01 only with OPTIONAL STOP', () => {
    expect(stopTimes(tl, { optionalStop: false, breakpoints: new Set() })).toEqual([2])
    expect(stopTimes(tl, { optionalStop: true, breakpoints: new Set() })).toEqual([2, 8])
  })

  it('stops before a block with a breakpoint, once per execution', () => {
    expect(stopTimes(tl, { optionalStop: false, breakpoints: new Set([2, 4]) })).toEqual([2, 8])
  })

  it('single block ends where the next block starts', () => {
    expect(blockEnd(tl, 0)).toBe(2)
    // Line 2 is two moves: its block ends after both
    expect(blockEnd(tl, 2)).toBe(8)
    expect(blockEnd(tl, 3.5)).toBe(8)
  })

  it('finds the next stop strictly after now', () => {
    expect(nextStop([2, 8], 2, 12)).toBe(8)
    expect(nextStop([2, 8], 9, 12)).toBe(12)
  })
})

describe('overrides', () => {
  it('scale feed and rapid times, and keep the same point of the program', () => {
    const plain = buildTimeline(r)
    const slow = buildTimeline(r, { feed: 0.5, rapid: 0.25, spindle: 1 })
    // Rapid 2 s at 25 % → 8 s; feeds 3+3+4 s at 50 % → 20 s
    expect(slow.total).toBe(28)
    // Halfway through the first feed (2 + 1.5 s) → 8 + 3 s on the slower timeline
    expect(sameMoment(plain, slow, 3.5)).toBe(11)
  })
})

describe('distance to go', () => {
  const at = (X: number, Z: number) => ({ X, Y: 0, Z, A: 0, B: 0, C: 0 })
  const moves = [
    { line: 1, position: at(10, 0) },
    { line: 2, position: at(10, -5) },
    { line: 2, position: at(20, -5) },
    { line: 3, position: at(0, 0) }
  ] as Move[]

  it('runs to the end of the whole block, not of the current move', () => {
    expect(distanceToGo(moves, 1, at(10, -2))).toEqual(at(10, -3))
  })

  it('is zero at the end of the block and undefined before the program starts', () => {
    expect(distanceToGo(moves, 3, at(0, 0))).toEqual(at(0, 0))
    expect(distanceToGo(moves, -1, at(0, 0))).toBeUndefined()
  })
})

describe('operations', () => {
  const ops = (tools: [number, Move['kind'], number][]) =>
    operations(buildTimeline({ ...result([]), moves: tools.map(([tool, kind, durationS], line) => ({ line, kind, durationS, state: { tool, feedPerMinute: true } })) as unknown as Move[] }))

  it('splits the program where the tool changes, with times and lines', () => {
    const list = ops([
      [1, 'rapid', 1],
      [1, 'feed', 4],
      [2, 'rapid', 2],
      [2, 'feed', 3],
      [1, 'feed', 5]
    ])
    expect(list.map((o) => [o.tool, o.first, o.last, o.start, o.end, o.fromLine, o.toLine, o.cutting])).toEqual([
      [1, 0, 1, 0, 5, 0, 1, 4],
      [2, 2, 3, 5, 10, 2, 3, 3],
      [1, 4, 4, 10, 15, 4, 4, 5]
    ])
  })

  it('is empty without moves', () => {
    expect(ops([])).toEqual([])
  })
})

describe('overrides on the cycle time', () => {
  const o = { feed: 1.5, rapid: 0.25, spindle: 0.8 }
  const mv = (kind: Move['kind'], feedPerMinute: boolean, thread?: boolean) => ({ kind, thread, state: { feedPerMinute } })

  it('rapids follow the rapid override, dwells nothing', () => {
    expect(overrideFactor(mv('rapid', true), o)).toBe(0.25)
    expect(overrideFactor(mv('dwell', true), o)).toBe(1)
  })

  it('feed per minute follows the feed override only', () => {
    expect(overrideFactor(mv('feed', true), o)).toBe(1.5)
  })

  it('feed per revolution (G95) also follows the spindle override', () => {
    expect(overrideFactor(mv('feed', false), o)).toBeCloseTo(1.2, 12)
  })

  it('threads follow the spindle only: the feed override is off while threading', () => {
    expect(overrideFactor(mv('feed', false, true), o)).toBe(0.8)
  })
})
