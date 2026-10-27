import type { WheelEvent } from 'react'
import { useI18n } from '../i18n'
import type { PanelState } from './Player'

// Override steps of a Fanuc panel: feed 0–150 % (here from 10 %), rapid F0/25/50/100 %, spindle 50–120 %
export const FEED_STEPS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150]
export const RAPID_STEPS = [10, 25, 50, 100]
const SPINDLE_STEPS = [50, 60, 70, 80, 90, 100, 110, 120]

/** Operating modes of the selector; only EDIT and MEM (memory run) are simulated. */
const MODES = ['EDIT', 'MEM', 'MDI', 'JOG', 'REF'] as const

/**
 * A rotary override switch: click turns it one step up, right click one step down, the wheel both ways.
 * The pointer sweeps 270°, like the knobs on the panel.
 */
function Knob({ label, steps, value, format, onChange, hint }: { label: string; steps: number[]; value: number; format: (v: number) => string; onChange: (v: number) => void; hint: string }) {
  const i = Math.max(0, steps.indexOf(value))
  const turn = (d: number) => onChange(steps[Math.min(steps.length - 1, Math.max(0, i + d))] ?? value)
  const angle = -135 + (270 * i) / Math.max(1, steps.length - 1)
  return (
    <div className="knob" title={hint}>
      <button
        aria-label={`${label} ${format(value)}`}
        onClick={() => turn(1)}
        onContextMenu={(e) => {
          e.preventDefault()
          turn(-1)
        }}
        onWheel={(e: WheelEvent) => turn(e.deltaY < 0 ? 1 : -1)}
      >
        <svg viewBox="0 0 64 64" aria-hidden>
          {steps.map((_, k) => {
            const a = ((-135 + (270 * k) / Math.max(1, steps.length - 1) - 90) * Math.PI) / 180
            return <line key={k} x1={32 + 27 * Math.cos(a)} y1={32 + 27 * Math.sin(a)} x2={32 + 30 * Math.cos(a)} y2={32 + 30 * Math.sin(a)} className={k <= i ? 'tick on' : 'tick'} />
          })}
          <circle cx="32" cy="32" r="22" className="knob-body" />
          <g transform={`rotate(${angle} 32 32)`}>
            <rect x="29" y="11" width="6" height="21" rx="3" className="knob-pointer" />
          </g>
        </svg>
      </button>
      <span className="knob-value">{format(value)}</span>
      <span className="knob-label">{label}</span>
    </div>
  )
}

interface Props {
  mode: 'mem' | 'edit'
  onMode: (mode: 'mem' | 'edit') => void
  playing: boolean
  /** Nothing to run (no moves, or EDIT). */
  disabled: boolean
  onCycleStart: () => void
  onFeedHold: () => void
  panel: PanelState
  onPanel: (change: Partial<PanelState>) => void
}

/** The machine's operator panel: mode selector, cycle start and feed hold, the lit keys and the override knobs. */
export function OperatorPanel({ mode, onMode, playing, disabled, onCycleStart, onFeedHold, panel, onPanel }: Props) {
  const { t } = useI18n()
  const keys: { key: keyof PanelState; label: string; hint: string }[] = [
    { key: 'singleBlock', label: 'SINGLE BLOCK', hint: t('panel.singleBlockHint') },
    { key: 'optionalStop', label: 'OPT STOP', hint: t('panel.optionalStopHint') },
    { key: 'blockSkip', label: 'BLOCK SKIP', hint: t('panel.blockSkipHint') }
  ]
  return (
    <div className="operator-panel" aria-label={t('panel.title')}>
      <div className="op-modes" role="radiogroup" aria-label={t('panel.mode')}>
        <span className="op-caption">MODE</span>
        <div className="op-mode-keys">
          {MODES.map((m) => {
            const live = m === 'EDIT' || m === 'MEM'
            const on = (m === 'EDIT' && mode === 'edit') || (m === 'MEM' && mode === 'mem')
            return (
              <button
                key={m}
                role="radio"
                aria-checked={on}
                className={`op-key ${on ? 'lit' : ''}`}
                disabled={!live}
                title={live ? t(m === 'EDIT' ? 'mode.editHint' : 'mode.memHint') : t('panel.modeNotSimulated')}
                onClick={() => onMode(m === 'EDIT' ? 'edit' : 'mem')}
              >
                <i className="led" />
                {m}
              </button>
            )
          })}
        </div>
      </div>
      <div className="op-run">
        <button className={`op-round start ${playing ? 'lit' : ''}`} disabled={disabled} title={t('panel.cycleStart')} onClick={onCycleStart}>
          <span>CYCLE<br />START</span>
        </button>
        <button className={`op-round hold ${!playing && !disabled ? 'lit' : ''}`} disabled={disabled} title={t('panel.feedHold')} onClick={onFeedHold}>
          <span>FEED<br />HOLD</span>
        </button>
      </div>
      <div className="op-keys">
        {keys.map((k) => {
          const on = !!panel[k.key]
          return (
            <button key={k.key} className={`op-key ${on ? 'lit' : ''}`} aria-pressed={on} title={k.hint} onClick={() => onPanel({ [k.key]: !on })}>
              <i className="led" />
              {k.label}
            </button>
          )
        })}
      </div>
      <div className="op-knobs">
        <Knob label="FEED %" steps={FEED_STEPS} value={panel.feed} format={(v) => `${v}%`} onChange={(v) => onPanel({ feed: v })} hint={t('panel.feedHint')} />
        <Knob label="RAPID" steps={RAPID_STEPS} value={panel.rapid} format={(v) => (v === 10 ? 'F0' : `${v}%`)} onChange={(v) => onPanel({ rapid: v })} hint={t('panel.rapidHint')} />
        <Knob label="SPINDLE %" steps={SPINDLE_STEPS} value={panel.spindle} format={(v) => `${v}%`} onChange={(v) => onPanel({ spindle: v })} hint={t('panel.spindleHint')} />
      </div>
    </div>
  )
}
