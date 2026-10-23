import type { RecentItem } from '../../preload/api'
import { useI18n } from '../i18n'

interface Props {
  recent: RecentItem[]
  onOpenExample: () => void
  onPick: () => void
  onOpenRecent: (item: RecentItem) => void
  onRemoveRecent: (item: RecentItem) => void
}

/** Shown when no program is open: actions on the left, recent files (example pinned first) on the right. */
export function StartScreen({ recent, onOpenExample, onPick, onOpenRecent, onRemoveRecent }: Props) {
  const { t, lang } = useI18n()
  const when = (ms: number) => new Date(ms).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })

  return (
    <main className="start">
      <section className="start-actions">
        <h2>{t('start.begin')}</h2>
        <button className="btn primary" onClick={onPick}>{t('action.openProgram')}…</button>
      </section>

      <section className="start-recent">
        <h2>{t('start.recent')}</h2>
        <ul>
          <li>
            <button className="recent-item" onClick={onOpenExample}>
              <span className="recent-name">
                O1500_COROA_ANSI40.nc <span className="tag">{t('start.example')}</span>
              </span>
              <span className="muted">{t('start.exampleDetail')}</span>
            </button>
          </li>
          {recent.map((item) => (
            <li key={item.path} className={item.missing ? 'missing' : ''}>
              <button className="recent-item" disabled={item.missing} onClick={() => onOpenRecent(item)}>
                <span className="recent-name">{item.name}</span>
                <span className="muted">
                  {item.missing ? t('start.missing') : window.api ? item.path : t('start.browserCopy')} · {when(item.openedAt)}
                </span>
              </button>
              <button className="btn tiny remove" title={t('start.remove')} aria-label={t('start.remove')} onClick={() => onRemoveRecent(item)}>
                ×
              </button>
            </li>
          ))}
        </ul>
        {!recent.length && <p className="muted">{t('start.empty')}</p>}
      </section>
    </main>
  )
}
