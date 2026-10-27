import { useCallback, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { readNumber, storage } from './platform'

const FONT_KEY = 'cncsim.codeFontSize'
const WIDTH_KEY = 'cncsim.codeWidth'

/** The program panel's font size and width, kept for the next documents. */
export function useCodePanel() {
  const [fontSize, setFontSize] = useState(() => readNumber(storage, FONT_KEY, 11.5))
  const [codeWidth, setCodeWidth] = useState(() => readNumber(storage, WIDTH_KEY, 300))

  const changeFont = useCallback((delta: number) => {
    setFontSize((f) => {
      const next = Math.min(22, Math.max(8, Math.round((f + delta) * 2) / 2))
      storage.set(FONT_KEY, String(next))
      return next
    })
  }, [])

  /** Drag the divider to widen the program panel; `dir` is -1 when the program is on the right. */
  function startResize(e: ReactPointerEvent<HTMLDivElement>, dir: 1 | -1) {
    const startX = e.clientX
    const startW = codeWidth
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    let w = startW
    const move = (ev: PointerEvent) => {
      w = Math.min(window.innerWidth * 0.6, Math.max(200, startW + dir * (ev.clientX - startX)))
      setCodeWidth(w)
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      storage.set(WIDTH_KEY, String(Math.round(w)))
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }

  return { fontSize, codeWidth, changeFont, startResize }
}
