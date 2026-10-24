import type { Move, ProgramPosition } from '@core/index'
import { useI18n } from '../i18n'

interface Props {
  move: Move | undefined
  position: ProgramPosition | undefined
  /** Machine coordinates at the same point (G53). */
  machinePosition: ProgramPosition | undefined
  index: number
  total: number
  /** Axes to show, from the machine definition. */
  axes: string[]
}

const fmt = (v: number) => (Math.abs(v) < 5e-7 ? 0 : v).toFixed(3)

export function PositionPanel({ move, position, machinePosition, index, total, axes }: Props) {
  const { t } = useI18n()
  if (!move || !position) return <p className="muted">{t('position.empty')}</p>
  const s = move.state
  return (
    <>
      {/* Like the control's POSITION (ALL) screen: absolute in the work offset, and machine */}
      <div className="dro">
        <span />
        <span className="h">{t('position.absolute')}</span>
        <span className="h">{t('position.machine')}</span>
        {axes.map((ax) => {
          const k = ax as keyof ProgramPosition
          const unit = ax === 'C' && !s.polar ? '°' : ''
          return (
            <div key={ax} className="axis">
              <span className="k">{ax}</span>
              <span className="v">
                {fmt(position[k])}
                {unit}
              </span>
              <span className="m">
                {machinePosition ? fmt(machinePosition[k]) : '—'}
                {unit}
              </span>
            </div>
          )
        })}
      </div>
      <dl className="facts">
        <dt>{t('position.block')}</dt>
        <dd>{t('position.blockValue', { line: move.line + 1, move: index + 1, total })}</dd>
      </dl>
    </>
  )
}
