import { useEffect, useRef } from 'react'
import type { MessageKey } from '@i18n/index'
import { useI18n } from '../i18n'

/** One step: the part of the screen it points at (outlined while shown) and its text. */
interface Step {
  target: string
  title: MessageKey
  text: MessageKey
}

// Scoped to the tab in front: the other tabs are in the page too, hidden
const W = '.workspace.active'
const STEPS: Step[] = [
  { target: `${W} .mp-status, ${W} .stage-dro`, title: 'tour.statusTitle', text: 'tour.status' },
  { target: `${W} .cnc-screen`, title: 'tour.programTitle', text: 'tour.program' },
  { target: `${W} .mdi, ${W} .feature-tree`, title: 'tour.pagesTitle', text: 'tour.pages' },
  { target: `${W} .operator-panel, ${W} .player`, title: 'tour.panelTitle', text: 'tour.panel' },
  { target: `${W} .status-bar`, title: 'tour.fileTitle', text: 'tour.file' },
  { target: '.titlebar', title: 'tour.layoutTitle', text: 'tour.layout' }
]

interface Props {
  step: number
  onStep: (step: number) => void
  onClose: () => void
}

/** Short first-use tour: a card at the bottom of the window, and the part it talks about outlined. */
export function Tour({ step, onStep, onClose }: Props) {
  const { t } = useI18n()
  const s = STEPS[step]
  const card = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!s) return
    const el = document.querySelector(s.target)
    el?.classList.add('tour-target')
    // The card goes on the other side of what it points at, so it never covers it
    const box = card.current
    if (el && box) {
      const r = el.getBoundingClientRect()
      const h = window.innerHeight
      box.style.top = ''
      box.style.bottom = ''
      if (r.height > h * 0.5) box.style.top = `${Math.round(h * 0.35)}px`
      else if (r.top + r.height / 2 > h / 2) box.style.bottom = `${Math.round(h - r.top + 12)}px`
      else box.style.top = `${Math.round(Math.min(h - 200, r.bottom + 12))}px`
    }
    return () => el?.classList.remove('tour-target')
  }, [s])
  if (!s) return null
  const last = step === STEPS.length - 1
  return (
    <div ref={card} className="tour" role="dialog" aria-label={t(s.title)}>
      <span className="muted small">
        {step + 1}/{STEPS.length}
      </span>
      <h3>{t(s.title)}</h3>
      <p>{t(s.text)}</p>
      <div className="row">
        <button className="btn" onClick={onClose}>{t('tour.skip')}</button>
        <span className="spacer" />
        {step > 0 && <button className="btn" onClick={() => onStep(step - 1)}>{t('tour.back')}</button>}
        <button className="btn primary" onClick={() => (last ? onClose() : onStep(step + 1))}>{t(last ? 'tour.done' : 'tour.next')}</button>
      </div>
    </div>
  )
}
