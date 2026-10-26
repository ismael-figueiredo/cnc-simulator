import { memo } from 'react'
import type { Move, ProgramPosition } from '@core/index'
import { useI18n } from '../i18n'
import { fmt, modalCodes } from './CncModal'

interface Props {
  move: Move | undefined
  position: ProgramPosition | undefined
  machinePosition: ProgramPosition | undefined
  /** To the end of the running block. */
  distanceToGo: ProgramPosition | undefined
  axes: string[]
  /** Spindle and live tool limits, for the load bars. */
  maxRpm: number
  maxLiveRpm: number
  /** Feed and rapid overrides, in percent. */
  feedOverride: number
  rapidOverride: number
  /** Spindle override, in percent (shown on S). */
  spindleOverride?: number
}

const FEED_KNOB_MAX = 150

function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <span className="mp-bar" aria-hidden>
      <i style={{ width: `${pct}%` }} />
    </span>
  )
}

/**
 * Top of the machine screen, as on the control: the position in large digits with machine coordinates
 * and distance to go, then spindle, feed with the overrides, tool and the active modal codes.
 */
export const StatusHeader = memo(function StatusHeader({ move, position, machinePosition, distanceToGo, axes, maxRpm, maxLiveRpm, feedOverride, rapidOverride, spindleOverride = 100 }: Props) {
  const { t } = useI18n()
  const s = move?.state
  const rapid = move?.kind === 'rapid'
  const live = !!s?.liveToolOn
  const rpm = s ? Math.round((live ? s.liveToolSpeed : s.spindleOn ? s.spindleSpeed : 0) * (spindleOverride / 100)) : 0
  return (
    <div className="mp-status">
      <div className="mp-pos">
        <span className="h" />
        <span className="h">{t('position.absolute')}</span>
        <span className="h">{t('position.machine')}</span>
        <span className="h">{t('position.toGo')}</span>
        {axes.map((ax) => {
          const k = ax as keyof ProgramPosition
          return (
            <div key={ax} className="axis">
              <span className="k">{ax}</span>
              <span className="v">{position ? fmt(position[k]) : fmt(0)}</span>
              <span className="m">{machinePosition ? fmt(machinePosition[k]) : '—'}</span>
              <span className="m">{distanceToGo ? fmt(distanceToGo[k]) : fmt(0)}</span>
            </div>
          )
        })}
      </div>
      <div className="mp-act">
        <div className="mp-meter">
          <b>{live ? 'S2' : 'S'}</b>
          <span className="val">{rpm}</span>
          <Bar value={rpm} max={live ? maxLiveRpm : maxRpm} />
          <small>{s?.spindleOn || live ? (live ? t('modal.live') : t('modal.spindle')) : t('position.stopped')}</small>
        </div>
        <div className="mp-meter">
          <b>F</b>
          <span className="val">{!s ? fmt(0) : rapid ? t('position.rapid') : fmt((s.feed * feedOverride) / 100)}</span>
          <Bar value={rapid ? rapidOverride : feedOverride} max={rapid ? 100 : FEED_KNOB_MAX} />
          <small>{s ? (s.feedPerMinute ? t('unit.mmMin') : t('unit.mmRev')) : ''}</small>
        </div>
        <div className="mp-ovr">
          <span>FOV {feedOverride}%</span>
          <span>SOV {spindleOverride}%</span>
          <span>{t('panel.rapid')} {rapidOverride === 10 ? 'F0' : `${rapidOverride}%`}</span>
          <span>
            T {s?.tool ? `${String(s.tool).padStart(2, '0')}${String(s.offset).padStart(2, '0')}` : '—'}
          </span>
        </div>
        <div className="mp-codes">
          {move ? modalCodes(move).map(([c, on]) => <span key={c} className={on ? 'on' : ''}>{c}</span>) : <span>{t('modal.reset')}</span>}
        </div>
      </div>
    </div>
  )
})
