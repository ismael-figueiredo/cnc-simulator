import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SimulationResult } from '@core/index'
import { blockEnd, buildTimeline, fractionOf, moveAt, nextStop, sameMoment, stopTimes, type Overrides, type Timeline } from './playback'

interface State {
  timeline: Timeline | null
  time: number
  playing: boolean
}

const STOPPED: State = { timeline: null, time: 0, playing: false }

export interface PlaybackOptions {
  /** Program seconds per real second. */
  speed: number
  singleBlock: boolean
  optionalStop: boolean
  /** Lines where playback stops before running them. */
  breakpoints: ReadonlySet<number>
}

/**
 * The run as the control plays it: the simulated moves on a timeline, the time on it, and cycle
 * start / feed hold. Playing runs to the end, the next stop (M00, M01 with OPTIONAL STOP, a breakpoint)
 * or, in single block, the end of the current block; playing again goes on from there.
 */
export function usePlayback({ speed, singleBlock, optionalStop, breakpoints }: PlaybackOptions) {
  const [state, setState] = useState<State>(STOPPED)
  const { timeline, time, playing } = state
  /** RESET: at the start and not running, nothing has been executed yet. */
  const atReset = time <= 0 && !playing
  const index = timeline && !atReset ? moveAt(timeline, time) : -1
  const fraction = timeline && index >= 0 ? fractionOf(timeline, index, time) : 1
  /** As the control's status line shows it: running, stopped part-way (feed hold), or at RESET. */
  const runState: 'start' | 'hold' | 'reset' = playing ? 'start' : time > 0 && time < (timeline?.total ?? 0) ? 'hold' : 'reset'
  /** Played to the end of a program that finished: the blocks after the last move (M05, M30) have run. */
  const ended = !playing && !!timeline?.result.end && time > 0 && time >= timeline.total
  const stops = useMemo(() => (timeline ? stopTimes(timeline, { optionalStop, breakpoints }) : []), [timeline, optionalStop, breakpoints])

  useEffect(() => {
    if (!playing) return
    let last = 0
    let frame = requestAnimationFrame(function tick(ts) {
      const dt = last ? (ts - last) / 1000 : 0
      last = ts
      setState((s) => {
        if (!s.playing || !s.timeline) return s
        const total = s.timeline.total
        const limit = Math.min(nextStop(stops, s.time, total), singleBlock ? blockEnd(s.timeline, s.time) : total)
        const t = Math.min(limit, s.time + dt * speed)
        return { ...s, time: t, playing: t < limit - 1e-12 }
      })
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing, speed, stops, singleBlock])

  /** A new run, like the control after loading a program: RESET, cursor at the top, nothing run yet. */
  const load = useCallback((result: SimulationResult, overrides: Overrides) => setState({ timeline: buildTimeline(result, overrides), time: 0, playing: false }), [])
  const clear = useCallback(() => setState(STOPPED), [])
  const pause = useCallback(() => setState((s) => ({ ...s, playing: false })), [])
  /** Overrides change the times: the same point of the program on the new timeline. */
  const retime = useCallback(
    (overrides: Overrides) =>
      setState((s) => {
        if (!s.timeline) return s
        const next = buildTimeline(s.timeline.result, overrides)
        return { ...s, timeline: next, time: sameMoment(s.timeline, next, s.time) }
      }),
    []
  )
  const seek = useCallback((t: number) => {
    setState((s) => ({ ...s, playing: false, time: Math.max(0, Math.min(s.timeline?.total ?? 0, t)) }))
  }, [])
  /** Shows move k just finished. A hair before its end: exactly at the end the next move would be current. */
  const seekMove = useCallback((k: number) => {
    setState((s) => {
      const end = s.timeline?.cumulative[k + 1] ?? 0
      const start = s.timeline?.cumulative[k] ?? 0
      return { ...s, playing: false, time: Math.max(start, end - 1e-6) }
    })
  }, [])
  function step(dir: -1 | 1) {
    if (!timeline?.result.moves.length) return
    const atEnd = fraction >= 1
    let k = dir > 0 ? (atEnd ? index + 1 : index) : atEnd ? index - 1 : index - 1
    k = Math.max(-1, Math.min(timeline.result.moves.length - 1, k))
    if (k < 0) seek(0)
    else seekMove(k)
  }
  /** Cycle start / feed hold; playing from the end starts over. */
  const togglePlay = useCallback(() => {
    setState((s) => (s.playing ? { ...s, playing: false } : { ...s, playing: true, time: s.time >= (s.timeline?.total ?? 0) ? 0 : s.time }))
  }, [])
  // Clicking a line starts from its next execution (loops run the same line many times):
  // the tool goes to the start of that move, so Play runs that block first.
  // Reads the current move from the state itself, so the callback never changes and the program
  // screen does not re-render just because playback moved on.
  const jumpToLine = useCallback((line: number) => {
    setState((s) => {
      const hits = s.timeline?.movesByLine.get(line)
      if (!s.timeline || !hits?.length) return s
      const current = s.time <= 0 && !s.playing ? -1 : moveAt(s.timeline, s.time)
      const next = hits.find((h) => h > current) ?? hits[0] ?? 0
      // A hair past the start, so the block counts as the current one and not as RESET
      return { ...s, playing: false, time: (s.timeline.cumulative[next] ?? 0) + 1e-6 }
    })
  }, [])

  return { timeline, time, playing, atReset, index, fraction, runState, ended, load, clear, pause, retime, seek, seekMove, step, togglePlay, jumpToLine }
}
