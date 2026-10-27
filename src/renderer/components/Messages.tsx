import { memo } from 'react'
import type { ChuckCollision, ConfigIssue, Diagnostic, HolderCollision } from '@core/index'
import { useI18n } from '../i18n'
import { configIssueText } from '../messages'

interface MessagesProps {
  issues: ConfigIssue[]
  diagnostics: Diagnostic[]
  collisions: HolderCollision[]
  chuckCollisions: ChuckCollision[]
  onDiagnostic: (d: Diagnostic) => void
  onMove: (moveIndex: number) => void
  /** Without the block and its heading (inside another panel). */
  bare?: boolean
}

/**
 * Messages and alarms of the run. Memoized: playback re-renders the app on every frame, and a CAM
 * program can bring thousands of messages that would all be drawn again each time.
 */
export const Messages = memo(function Messages({ issues, diagnostics, collisions, chuckCollisions, onDiagnostic, onMove, bare }: MessagesProps) {
  const { t } = useI18n()
  const count = diagnostics.length + issues.length + collisions.length + chuckCollisions.length
  return (
    <div className={bare ? 'messages' : 'block'}>
      {!bare && (
        <h2>
          {t('messages.title')}
          {count > 0 && <span className="count">{count}</span>}
        </h2>
      )}
      {issues.map((i, k) => (
        <p key={`cfg${k}`} className="msg alarm">
          <b>{t('severity.alarm')}</b>
          <span>{configIssueText(t, i)}</span>
        </p>
      ))}
      {diagnostics.map((d, k) => (
        <button key={k} className={`msg ${d.severity}`} onClick={() => onDiagnostic(d)}>
          <b>{d.alarm?.code ?? t(`severity.${d.severity}`)}</b>
          <span>
            L{d.line + 1} · {d.alarm?.message && <strong>{d.alarm.message} · </strong>}
            {t(`diag.${d.code}`, d.params)}
          </span>
        </button>
      ))}
      {collisions.map((c) => (
        <button key={`col${c.tool}|${c.line}`} className="msg warning" onClick={() => onMove(c.moveIndex)}>
          <b>{t('collision.label')}</b>
          <span>
            L{c.line + 1} · {t('collision.holder', { tool: String(c.tool).padStart(2, '0'), depth: c.depth })}
          </span>
        </button>
      ))}
      {chuckCollisions.map((c) => (
        <button key={`${c.part ?? 'chuck'}${c.tool}|${c.line}`} className="msg alarm" onClick={() => onMove(c.moveIndex)}>
          <b>{t('collision.label')}</b>
          <span>
            L{c.line + 1} · {t(c.part === 'tailstock' ? 'collision.tailstock' : 'collision.chuck', { tool: String(c.tool).padStart(2, '0'), z: c.z })}
          </span>
        </button>
      ))}
      {!count && <p className="muted">{t('messages.none')}</p>}
    </div>
  )
})
