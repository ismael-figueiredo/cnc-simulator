import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Severity } from '@core/index'
import { useI18n } from '../i18n'

/** Run state shown on the status line, as the Fanuc screen does: reset (****), cycle start, feed hold. */
export type RunState = 'reset' | 'start' | 'hold'

interface Props {
  lines: string[]
  currentLine: number
  /** Line where an alarm stopped the program, or -1. */
  alarmLine: number
  /** Worst diagnostic per line. */
  marks: Map<number, Severity>
  /** Lines that produced at least one move. */
  hits: Set<number>
  fontSize: number
  state: RunState
  /** Ctrl + wheel over the code changes the font size by this step. */
  onZoom: (delta: number) => void
  onLineClick: (line: number) => void
  /** Lines with a breakpoint (red dot on the line number). */
  breakpoints: ReadonlySet<number>
  /** Clicking a line number sets or clears its breakpoint. */
  onToggleBreakpoint: (line: number) => void
}

/** Lines kept visible below the cursor before the screen scrolls, like the control's program screen. */
const LOOKAHEAD = 3

const STATE_LABEL: Record<RunState, string> = { reset: '****', start: 'STRT', hold: 'HOLD' }

const programNumber = (lines: string[]) => {
  for (const l of lines) {
    const m = /^\s*([O:])(\d+)/i.exec(l)
    if (m?.[2]) return `O${m[2].padStart(4, '0')}`
  }
  return 'O----'
}

/**
 * Last sequence number at or before each line, as shown in the screen header. Worked out once per
 * program: searching back from the cursor on every move took a whole pass over CAM files without N.
 */
const sequenceNumbers = (lines: string[]): string[] => {
  const out: string[] = []
  let last = 'N-----'
  for (const l of lines) {
    const m = /(?:^|[^A-Z#])N(\d+)/i.exec(l.replace(/\(.*?\)/g, ''))
    if (m?.[1]) last = `N${m[1].padStart(5, '0')}`
    out.push(last)
  }
  return out
}

/** Line height in the stylesheet (.code line-height), in font sizes. */
const LINE_HEIGHT = 1.45
/** Lines drawn above and below what is on screen, so fast scrolling shows no gaps. */
const OVERSCAN = 30

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return <span>{now.toLocaleTimeString('en-GB')}</span>
}

// Re-renders only when the current line or the program changes, not on every playback frame.
export const CodeView = memo(function CodeView({ lines, currentLine, alarmLine, marks, hits, fontSize, state, onZoom, onLineClick, breakpoints, onToggleBreakpoint }: Props) {
  const { t } = useI18n()
  const box = useRef<HTMLDivElement>(null)
  const oNumber = useMemo(() => programNumber(lines), [lines])
  const sequence = useMemo(() => sequenceNumbers(lines), [lines])
  // Only the lines on screen are in the page (a CAM program can have hundreds of thousands):
  // every line has the same height, so line i sits at i * rowHeight.
  const rowHeight = fontSize * LINE_HEIGHT
  const [view, setView] = useState({ top: 0, height: 800 })
  // Scroll position and height as last read or written: following the cursor uses these instead of
  // reading the element, which would force a layout on every move during playback.
  const scroll = useRef({ top: 0, height: 800 })
  const readView = () => {
    const el = box.current
    if (!el) return
    scroll.current = { top: el.scrollTop, height: el.clientHeight }
    setView((v) => (v.top === el.scrollTop && v.height === el.clientHeight ? v : { ...scroll.current }))
  }
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      scroll.current = { top: el.scrollTop, height: el.clientHeight }
      setView((v) => (v.height === el.clientHeight ? v : { ...scroll.current }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // The program starts at the top; the screen scrolls only when the cursor would leave it,
  // keeping a few lines ahead visible (or one line above when jumping back).
  useLayoutEffect(() => {
    const parent = box.current
    if (!parent) return
    if (currentLine < 0) {
      parent.scrollTop = 0
      return
    }
    const h = rowHeight
    const top = currentLine * h
    const bottom = top + h * (LOOKAHEAD + 1)
    const s = scroll.current
    let next = s.top
    if (bottom > s.top + s.height) next = bottom - s.height
    else if (top - h < s.top) next = Math.max(0, top - h)
    // Written only when the cursor leaves the screen, which is every few lines, not every move
    if (next !== s.top) {
      parent.scrollTop = next
      scroll.current = { ...s, top: next }
    }
  }, [currentLine, rowHeight, lines])

  // Lines to draw: the ones on screen, plus the cursor's neighbourhood, so the frame where the
  // screen follows the cursor (before the scroll event arrives) already has its lines.
  const shown = useMemo(() => {
    const perScreen = Math.ceil(view.height / rowHeight)
    const first = Math.max(0, Math.floor(view.top / rowHeight) - OVERSCAN)
    const last = Math.min(lines.length - 1, first + perScreen + 2 * OVERSCAN)
    const set = new Set<number>()
    for (let i = first; i <= last; i++) set.add(i)
    if (currentLine >= 0)
      for (let i = Math.max(0, currentLine - perScreen - 2); i <= Math.min(lines.length - 1, currentLine + perScreen + 2); i++) set.add(i)
    return [...set].sort((a, b) => a - b)
  }, [view, rowHeight, lines.length, currentLine])

  // React's onWheel is passive, so Ctrl + wheel zoom needs a native listener to stop the page zoom
  useEffect(() => {
    const el = box.current
    if (!el) return
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      onZoom(e.deltaY < 0 ? 0.5 : -0.5)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [onZoom])

  const alarm = alarmLine >= 0
  return (
    <div className="cnc-screen" style={{ fontSize }}>
      <div className="cnc-head">
        <span>{t('cnc.program')}</span>
        <span className="dim">{t('program.lines', { count: lines.length })}</span>
        <span>{oNumber}</span>
        <span>{currentLine >= 0 ? (sequence[Math.min(currentLine, sequence.length - 1)] ?? 'N-----') : 'N-----'}</span>
      </div>
      <div className="code" ref={box} role="listbox" title={t('code.clickHint')} onScroll={readView}>
        <div className="code-lines" style={{ height: lines.length * rowHeight }}>
          {shown.map((i) => {
            const text = lines[i] ?? ''
            const mark = marks.get(i)
            const cls = [
              'line',
              i === currentLine ? 'current' : '',
              i < currentLine ? 'done' : '',
              i === alarmLine ? 'stopped' : '',
              mark ?? '',
              hits.has(i) ? 'hit' : ''
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <div
                key={i}
                data-line={i}
                className={cls}
                role="option"
                aria-selected={i === currentLine}
                style={{ top: i * rowHeight, height: rowHeight }}
                onClick={() => onLineClick(i)}
              >
                <span
                className={breakpoints.has(i) ? 'n bp' : 'n'}
                title={t('code.breakpointHint')}
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleBreakpoint(i)
                }}
              >
                {i + 1}
              </span>
                <span className="t">{text || ' '}</span>
              </div>
            )
          })}
        </div>
      </div>
      <div className="cnc-status">
        <span>MEM</span>
        <span className={state === 'start' ? 'on' : ''}>{STATE_LABEL[state]}</span>
        {alarm ? <span className="alm">ALM</span> : <span>***</span>}
        <Clock />
      </div>
    </div>
  )
})
