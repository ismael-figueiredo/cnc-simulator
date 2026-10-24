import { memo } from 'react'
import type { Move } from '@core/index'
import { useI18n } from '../i18n'

export const fmt = (v: number) => (Math.abs(v) < 5e-7 ? 0 : v).toFixed(3)

/** Active modal codes of a move, each flagged when it stands out (motion, compensation, polar, cycle). */
export function modalCodes(move: Move): [string, boolean][] {
  const s = move.state
  const codes: [string, boolean][] = [
    [move.kind === 'rapid' ? 'G00' : `G0${s.motion}`, true],
    [`G${s.plane}`, false],
    [s.absolute ? 'G90' : 'G91', false],
    [s.feedPerMinute ? 'G94' : 'G95', false],
    [`G${s.cutterComp}`, s.cutterComp !== 40],
    [s.workOffset, false]
  ]
  if (s.polar) codes.push(['G12.1', true])
  if (s.cycle) codes.push([s.cycle, true])
  return codes
}

/**
 * The control's MODAL area above the running program: active G codes, F, S, T and the canned cycle,
 * as on the Fanuc PROGRAM CHECK screen. Re-renders only when the move changes.
 */
export const CncModal = memo(function CncModal({ move }: { move: Move | undefined }) {
  const { t } = useI18n()
  if (!move) return <div className="cnc-modal muted-row">{t('modal.reset')}</div>
  const s = move.state
  const codes = modalCodes(move)
  const speed = s.liveToolOn ? `S2=${s.liveToolSpeed}` : `S${s.spindleSpeed}`
  return (
    <div className="cnc-modal">
      <div className="codes">
        {codes.map(([c, on]) => (
          <span key={c} className={on ? 'on' : ''}>{c}</span>
        ))}
      </div>
      <div className="act">
        <span>
          <b>F</b> {move.kind === 'rapid' ? t('position.rapid') : `${fmt(s.feed)} ${s.feedPerMinute ? t('unit.mmMin') : t('unit.mmRev')}`}
        </span>
        <span>
          <b>{speed}</b> {s.spindleOn || s.liveToolOn ? (s.liveToolOn ? t('modal.live') : t('modal.spindle')) : t('position.stopped')}
        </span>
        <span>
          <b>T</b> {s.tool ? `${String(s.tool).padStart(2, '0')}${String(s.offset).padStart(2, '0')}` : '—'}
          {move.toolRadius ? ` R${move.toolRadius}` : ''}
        </span>
      </div>
    </div>
  )
})
