import { memo, useEffect, useLayoutEffect, useRef } from 'react'
import type { Severity } from '@core/index'

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
  /** Ctrl + wheel over the code changes the font size by this step. */
  onZoom: (delta: number) => void
  onLineClick: (line: number) => void
}

/** Where the running line stays, as a fraction of the panel height (like the machine's program screen). */
const ANCHOR = 0.35

// Re-renders only when the current line or the program changes, not on every playback frame.
export const CodeView = memo(function CodeView({ lines, currentLine, alarmLine, marks, hits, fontSize, onZoom, onLineClick }: Props) {
  const box = useRef<HTMLDivElement>(null)

  // The running line stays parked at the anchor and the program scrolls under it
  useLayoutEffect(() => {
    const parent = box.current
    const el = parent?.querySelector<HTMLElement>(`[data-line="${currentLine}"]`)
    if (!parent || !el) return
    parent.scrollTop = el.offsetTop - parent.clientHeight * ANCHOR + el.offsetHeight / 2
  }, [currentLine, fontSize])

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

  return (
    <div className="code" ref={box} role="listbox" style={{ fontSize }}>
      <div className="code-pad top" style={{ height: `${ANCHOR * 100}%` }} />
      {lines.map((text, i) => {
        const mark = marks.get(i)
        const cls = [
          'line',
          i === currentLine ? 'current' : '',
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
      <div className="code-pad bottom" style={{ height: `${(1 - ANCHOR) * 100}%` }} />
    </div>
  )
})
