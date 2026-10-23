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
  const motion = move.kind === 'rapid' ? 'G00' : `G0${s.motion}`
  const chips: [string, boolean][] = [
    [motion, true],
    [s.workOffset, true],
    [s.absolute ? 'G90' : 'G91', false],
    [s.feedPerMinute ? 'G94' : 'G95', false],
    [t('chip.polar'), s.polar],
    [`G${s.cutterComp}`, s.cutterComp !== 40],
    [t('chip.cAxis'), s.cAxisEnabled],
    [t('chip.brake'), s.brake]
  ]
  if (s.cycle) chips.push([s.cycle, true])
  const spindle = s.liveToolOn
    ? t('position.live', { speed: s.liveToolSpeed })
    : s.spindleOn
      ? t('position.main', { speed: s.spindleSpeed })
      : t('position.stopped')
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
        <dt>{t('position.tool')}</dt>
        <dd>{s.tool ? `T${String(s.tool).padStart(2, '0')}${String(s.offset).padStart(2, '0')} · R${move.toolRadius}` : '—'}</dd>
        <dt>{t('position.feed')}</dt>
        <dd>{move.kind === 'rapid' ? t('position.rapid') : `${s.feed} ${s.feedPerMinute ? t('unit.mmMin') : t('unit.mmRev')}`}</dd>
        <dt>{t('position.spindle')}</dt>
        <dd>{spindle}</dd>
      </dl>
      <div className="chips">
        {chips.map(([label, on]) => (
          <span key={label} className={on ? 'chip on' : 'chip'}>{label}</span>
        ))}
      </div>
    </>
  )
}
