import { useI18n } from '../i18n'
import { formatTime } from '../playback'
import { FEED_STEPS as FEEDS, RAPID_STEPS as RAPIDS } from './OperatorPanel'

interface Props {
  time: number
  total: number
  playing: boolean
  speed: number
  disabled: boolean
  /** EDIT mode: the program can be looked through but only runs in MEM. */
  runDisabled: boolean
  onSeek: (time: number) => void
  onTogglePlay: () => void
  onStep: (dir: -1 | 1) => void
  onSpeed: (speed: number) => void
  /** Operator panel keys and override knobs. */
  panel: PanelState
  onPanel: (change: Partial<PanelState>) => void
  /** Timeline under the slider: one colored stretch per tool, and marks where the run stops or warns. */
  strip?: Strip
  /** Machine screen: the operator panel has RESET, cycle start and the keys; only the simulation controls stay here. */
  simOnly?: boolean
}

export interface Strip {
  segments: { start: number; end: number; color: string; title: string }[]
  marks: { at: number; kind: 'alarm' | 'stop' | 'collision'; title: string }[]
}

/** The keys and knobs of the machine's operator panel that change how the program runs. */
export interface PanelState {
  /** SINGLE BLOCK: stop at the end of every block. */
  singleBlock: boolean
  /** OPTIONAL STOP: M01 stops the run. */
  optionalStop: boolean
  /** BLOCK DELETE: blocks starting with "/" are skipped. */
  blockSkip: boolean
  /** Feed, rapid and spindle overrides, in percent. */
  feed: number
  rapid: number
  spindle: number
}


const SPEEDS = [1, 5, 20, 100, 1000]
const STEPS = 10000

export function Player({ time, total, playing, speed, disabled, runDisabled, onSeek, onTogglePlay, onStep, onSpeed, panel, onPanel, strip, simOnly }: Props) {
  const pct = (s: number) => `${total > 0 ? (Math.max(0, Math.min(total, s)) / total) * 100 : 0}%`
  const { t } = useI18n()
  return (
    <div className={`player ${simOnly ? 'sim-only' : ''}`}>
      {simOnly && <span className="sim-caption">{t('player.simulation')}</span>}
      {!simOnly && <button className="btn reset" disabled={disabled} title={t('player.start')} onClick={() => onSeek(0)}>RESET</button>}
      <button className="btn icon" disabled={disabled} title={t('player.back')} aria-label={t('player.back')} onClick={() => onStep(-1)}>◀</button>
      {!simOnly && (
        <button className="btn primary play" disabled={disabled || runDisabled} title={runDisabled ? t('player.editMode') : undefined} onClick={onTogglePlay}>
          {playing ? `⏸ ${t('player.pause')}` : `▶ ${t('player.play')}`}
        </button>
      )}
      <button className="btn icon" disabled={disabled} title={t('player.forward')} aria-label={t('player.forward')} onClick={() => onStep(1)}>▶|</button>
      <button className="btn icon" disabled={disabled} title={t('player.end')} aria-label={t('player.end')} onClick={() => onSeek(total)}>⏭</button>
      <div className="track">
        <input
          id="player-slider"
          type="range"
          min={0}
          max={STEPS}
          value={total > 0 ? Math.round((time / total) * STEPS) : STEPS}
          disabled={disabled}
          aria-label={t('player.position')}
          onChange={(e) => onSeek((total * Number(e.target.value)) / STEPS)}
        />
        {strip && total > 0 && (
          <div className="strip">
            {strip.segments.map((s) => (
              <button
                key={s.start}
                className="seg"
                style={{ left: pct(s.start), width: pct(s.end - s.start), background: s.color }}
                title={s.title}
                aria-label={s.title}
                onClick={() => onSeek(s.start + 1e-6)}
              />
            ))}
            {strip.marks.map((m, k) => (
              <span key={k} className={`mark ${m.kind}`} style={{ left: pct(m.at) }} title={m.title} />
            ))}
          </div>
        )}
      </div>
      <select id="player-speed" value={speed} aria-label={t('player.speed')} title={t('player.speed')} onChange={(e) => onSpeed(Number(e.target.value))}>
        {SPEEDS.map((s) => (
          <option key={s} value={s}>{s}×</option>
        ))}
      </select>
      <span className="time">
        {formatTime(time)} / {formatTime(total)}
      </span>
      {!simOnly && <div className="panel-keys">
        <button className={`key ${panel.singleBlock ? 'on' : ''}`} aria-pressed={panel.singleBlock} title={t('panel.singleBlockHint')} onClick={() => onPanel({ singleBlock: !panel.singleBlock })}>
          {t('panel.singleBlock')}
        </button>
        <button className={`key ${panel.optionalStop ? 'on' : ''}`} aria-pressed={panel.optionalStop} title={t('panel.optionalStopHint')} onClick={() => onPanel({ optionalStop: !panel.optionalStop })}>
          M01
        </button>
        <button className={`key ${panel.blockSkip ? 'on' : ''}`} aria-pressed={panel.blockSkip} title={t('panel.blockSkipHint')} onClick={() => onPanel({ blockSkip: !panel.blockSkip })}>
          {t('panel.blockSkip')}
        </button>
        <label title={t('panel.feedHint')}>
          F%
          <select value={panel.feed} onChange={(e) => onPanel({ feed: Number(e.target.value) })}>
            {FEEDS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </label>
        <label title={t('panel.rapidHint')}>
          {t('panel.rapid')}
          <select value={panel.rapid} onChange={(e) => onPanel({ rapid: Number(e.target.value) })}>
            {RAPIDS.map((r) => (
              <option key={r} value={r}>{r === 10 ? 'F0' : r}</option>
            ))}
          </select>
        </label>
      </div>}
    </div>
  )
}
