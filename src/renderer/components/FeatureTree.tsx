import { memo, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { formatTime, type Operation } from '../playback'
import { toolColor } from '../toolColors'

interface Props {
  program: string
  machine: string
  control: string
  /** Stock and work offsets in short. */
  stock: string
  offsets: string[]
  tools: { number: number; name: string }[]
  operations: Operation[]
  /** Operation being run, and the one picked (highlighted in 3D). */
  current: number
  selected: number
  messages: number
  alarm: boolean
  /** The messages list, shown under its node. */
  messageList: ReactNode
  onStock: () => void
  onOffsets: () => void
  onTools: () => void
  onToolOffsets: () => void
  onOperation: (index: number) => void
}

const Node = ({ icon, label, detail, onClick, title }: { icon: string; label: string; detail?: string; onClick?: () => void; title?: string }) => (
  <button className="tree-node" onClick={onClick} disabled={!onClick} title={title}>
    <span className="tree-icon" aria-hidden>{icon}</span>
    <span className="tree-label">{label}</span>
    {detail && <span className="tree-detail">{detail}</span>}
  </button>
)

/**
 * The document as a tree, like a CAD program's feature manager: program, machine, stock, offsets,
 * tools, the operations the program makes, and its messages. Clicking a node edits or selects it.
 */
export const FeatureTree = memo(function FeatureTree(props: Props) {
  const { program, machine, control, stock, offsets, tools, operations, current, selected, messages, alarm, messageList } = props
  const { t } = useI18n()
  return (
    <nav className="feature-tree" aria-label={t('tree.title')}>
      <Node icon="▤" label={program} detail={t('tree.program')} />
      <Node icon="⚙" label={machine} detail={control} title={t('status.machineHint')} />
      <Node icon="▣" label={t('stock.title')} detail={stock} onClick={props.onStock} title={t('tree.editHint')} />
      <Node icon="⌖" label={t('offsets.title')} detail={offsets.length ? offsets.join(' · ') : t('tree.none')} onClick={props.onOffsets} title={t('tree.editHint')} />
      <details open>
        <summary>
          <span className="tree-icon" aria-hidden>⚒</span>
          {t('tools.title')}
          <span className="tree-detail">{tools.length}</span>
        </summary>
        {tools.map((x) => (
          <Node key={x.number} icon="·" label={`T${String(x.number).padStart(2, '0')}`} detail={x.name} onClick={props.onTools} title={t('tree.editHint')} />
        ))}
        <Node icon="±" label={t('toolOffsets.title')} onClick={props.onToolOffsets} title={t('tree.editHint')} />
      </details>
      <details open>
        <summary>
          <span className="tree-icon" aria-hidden>▶</span>
          {t('ops.title')}
          <span className="tree-detail">{operations.length}</span>
        </summary>
        {operations.map((op, k) => (
          <button
            key={op.first}
            className={['tree-node', 'op', k === selected ? 'selected' : '', k === current ? 'running' : ''].filter(Boolean).join(' ')}
            title={t('tree.opHint')}
            onClick={() => props.onOperation(k)}
          >
            <i style={{ background: toolColor(op.tool) }} />
            <span className="tree-label">{op.tool > 0 ? `T${String(op.tool).padStart(2, '0')}` : '—'}</span>
            <span className="tree-detail">
              {tools.find((x) => x.number === op.tool)?.name ?? ''} · {formatTime(op.end - op.start)} · L{op.fromLine + 1}–{op.toLine + 1}
            </span>
          </button>
        ))}
      </details>
      <details open={alarm}>
        <summary className={alarm ? 'alm' : ''}>
          <span className="tree-icon" aria-hidden>⚠</span>
          {t('messages.title')}
          <span className="tree-detail">{messages}</span>
        </summary>
        <div className="tree-messages">{messageList}</div>
      </details>
    </nav>
  )
})
