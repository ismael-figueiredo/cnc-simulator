import { memo } from 'react'
import { useI18n } from '../i18n'
import { formatTime, type Operation } from '../playback'

// Distinct, readable on the dark screens and on the light panel
const PALETTE = ['#5ea4f2', '#3fd19c', '#f0b43a', '#c792ea', '#f06b50', '#4fd1e0', '#e0d24f', '#f28fb8', '#9bd65e', '#b0a4f2']

/** Color of a tool on the timeline and in the operation list (the same tool keeps its color). */
export const toolColor = (tool: number) => (tool > 0 ? (PALETTE[(tool - 1) % PALETTE.length] ?? '#8d99a3') : '#8d99a3')

interface Props {
  operations: Operation[]
  /** Tool names from the project's library. */
  names: Map<number, string>
  /** Operation being run, -1 at RESET. */
  current: number
  onPick: (op: Operation) => void
}

/** Operation list, as in a CAM: each tool use with its time and lines; clicking one goes to its start. */
export const Operations = memo(function Operations({ operations, names, current, onPick }: Props) {
  const { t } = useI18n()
  if (!operations.length) return <p className="muted">{t('ops.none')}</p>
  return (
    <ol className="ops">
      {operations.map((op, k) => (
        <li key={op.first}>
          <button className={k === current ? 'on' : ''} onClick={() => onPick(op)}>
            <i style={{ background: toolColor(op.tool) }} />
            <b>{op.tool > 0 ? `T${String(op.tool).padStart(2, '0')}` : '—'}</b>
            <span className="name">{names.get(op.tool) ?? (op.tool > 0 ? t('ops.unknownTool') : t('ops.noTool'))}</span>
            <span className="muted">
              {formatTime(op.end - op.start)} · {t('ops.cutting', { time: formatTime(op.cutting) })} · L{op.fromLine + 1}–{op.toLine + 1}
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
})
