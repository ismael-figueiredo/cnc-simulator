import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ModalState, Move, SimulationResult } from '../../src/core'
import { usePlayback } from '../../src/renderer/usePlayback'

const state = { spindleOn: true, feedPerMinute: true } as ModalState
const move = (line: number): Move => ({ kind: 'feed', line, points: [[0, 0, 0], [10, 0, 0]], durationS: 2, toolRadius: 0, state }) as unknown as Move
const result = (end?: SimulationResult['end']): SimulationResult => ({ moves: [move(3), move(4)], diagnostics: [], finished: !!end, totalTimeS: 4, tools: [], variables: [], ...(end ? { end } : {}) })
const options = { speed: 1, singleBlock: false, optionalStop: false, breakpoints: new Set<number>() }
const overrides = { feed: 1, rapid: 1, spindle: 1 }

describe('playback end', () => {
  it('is reached at the end of a finished program, not before and not while running', () => {
    const { result: hook } = renderHook(() => usePlayback(options))
    act(() => hook.current.load(result({ line: 6, code: 'M30', state: { ...state, spindleOn: false } }), overrides))
    expect(hook.current.ended).toBe(false)
    act(() => hook.current.seek(2))
    expect(hook.current.ended).toBe(false)
    act(() => hook.current.seek(4))
    expect(hook.current.ended).toBe(true)
    act(() => hook.current.seek(0))
    expect(hook.current.ended).toBe(false)
  })

  it('never ends a program that stopped before its end code', () => {
    const { result: hook } = renderHook(() => usePlayback(options))
    act(() => hook.current.load(result(), overrides))
    act(() => hook.current.seek(4))
    expect(hook.current.ended).toBe(false)
  })
})
