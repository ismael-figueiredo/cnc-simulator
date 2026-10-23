import { useI18n } from '../i18n'
import { formatTime } from '../playback'

interface Props {
  time: number
  total: number
  playing: boolean
  speed: number
  disabled: boolean
  onSeek: (time: number) => void
  onTogglePlay: () => void
  onStep: (dir: -1 | 1) => void
  onSpeed: (speed: number) => void
}

const SPEEDS = [1, 5, 20, 100, 1000]
const STEPS = 10000

export function Player({ time, total, playing, speed, disabled, onSeek, onTogglePlay, onStep, onSpeed }: Props) {
  const { t } = useI18n()
  return (
    <div className="player">
      <button className="btn icon" disabled={disabled} title={t('player.start')} aria-label={t('player.start')} onClick={() => onSeek(0)}>⏮</button>
      <button className="btn icon" disabled={disabled} title={t('player.back')} aria-label={t('player.back')} onClick={() => onStep(-1)}>◀</button>
      <button className="btn primary play" disabled={disabled} onClick={onTogglePlay}>
        {playing ? `⏸ ${t('player.pause')}` : `▶ ${t('player.play')}`}
      </button>
      <button className="btn icon" disabled={disabled} title={t('player.forward')} aria-label={t('player.forward')} onClick={() => onStep(1)}>▶|</button>
      <button className="btn icon" disabled={disabled} title={t('player.end')} aria-label={t('player.end')} onClick={() => onSeek(total)}>⏭</button>
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
      <select id="player-speed" value={speed} aria-label={t('player.speed')} title={t('player.speed')} onChange={(e) => onSpeed(Number(e.target.value))}>
        {SPEEDS.map((s) => (
          <option key={s} value={s}>{s}×</option>
        ))}
      </select>
      <span className="time">
        {formatTime(time)} / {formatTime(total)}
      </span>
    </div>
  )
}
