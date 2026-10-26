import type { ProgramPosition } from '@core/index'
import { useI18n } from '../i18n'

const fmt = (v: number) => (Math.abs(v) < 5e-7 ? 0 : v).toFixed(3)

interface AllProps {
  position: ProgramPosition | undefined
  machinePosition: ProgramPosition | undefined
  distanceToGo: ProgramPosition | undefined
  axes: string[]
  /** Block line (1-based) and move counter, or nothing at RESET. */
  block: string
  /** Run time so far and cycle time, already formatted. */
  runTime: string
  cycleTime: string
}

/** POS page of the machine layout, like the control's POSITION (ALL) screen: one quadrant per coordinate system. */
export function PositionAll({ position, machinePosition, distanceToGo, axes, block, runTime, cycleTime }: AllProps) {
  const { t } = useI18n()
  const quadrant = (title: string, p: ProgramPosition | undefined) => (
    <section className="pos-quadrant">
      <h3>{title}</h3>
      {axes.map((ax) => (
        <div key={ax} className="pos-row">
          <span className="k">{ax}</span>
          <span className="v">{fmt(p ? p[ax as keyof ProgramPosition] : 0)}</span>
        </div>
      ))}
    </section>
  )
  return (
    <div className="pos-all">
      {quadrant(t('position.absolute'), position)}
      {quadrant(t('position.machine'), machinePosition)}
      {quadrant(t('position.toGo'), distanceToGo)}
      <section className="pos-quadrant info">
        <h3>{t('position.block')}</h3>
        <div className="pos-row">
          <span className="v small">{block}</span>
        </div>
        <h3>{t('position.runTime')}</h3>
        <div className="pos-row">
          <span className="v small">
            {runTime} / {cycleTime}
          </span>
        </div>
      </section>
    </div>
  )
}
