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

/** Last sequence number at or before the line, as shown in the screen header. */
const sequenceAt = (lines: string[], line: number) => {
  for (let i = Math.min(line, lines.length - 1); i >= 0; i--) {
    const m = /(?:^|[^A-Z#])N(\d+)/i.exec(lines[i]?.replace(/\(.*?\)/g, '') ?? '')
    if (m?.[1]) return `N${m[1].padStart(5, '0')}`
  }
  return 'N-----'
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return <span>{now.toLocaleTimeString('en-GB')}</span>
}

// Re-renders only when the current line or the program changes, not on every playback frame.
export const CodeView = memo(function CodeView({ lines, currentLine, alarmLine, marks, hits, fontSize, state, onZoom, onLineClick }: Props) {
  const { t } = useI18n()
  const box = useRef<HTMLDivElement>(null)
  const oNumber = useMemo(() => programNumber(lines), [lines])

  // The program starts at the top; the screen scrolls only when the cursor would leave it,
  // keeping a few lines ahead visible (or one line above when jumping back).
  useLayoutEffect(() => {
    const parent = box.current
    const el = parent?.querySelector<HTMLElement>(`[data-line="${Math.max(0, currentLine)}"]`)
    if (!parent || !el) return
    if (currentLine < 0) {
      parent.scrollTop = 0
      return
    }
    const h = el.offsetHeight
    const top = el.offsetTop
    const bottom = top + h * (LOOKAHEAD + 1)
    if (bottom > parent.scrollTop + parent.clientHeight) parent.scrollTop = bottom - parent.clientHeight
    else if (top - h < parent.scrollTop) parent.scrollTop = Math.max(0, top - h)
  }, [currentLine, fontSize, lines])

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
        <span>{sequenceAt(lines, currentLine)}</span>
      </div>
      <div className="code" ref={box} role="listbox">
        {lines.map((text, i) => {
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
            <div key={i} data-line={i} className={cls} role="option" aria-selected={i === currentLine} onClick={() => onLineClick(i)}>
              <span className="n">{i + 1}</span>
              <span className="t">{text || ' '}</span>
            </div>
          )
        })}
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
