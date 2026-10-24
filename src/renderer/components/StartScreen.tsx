import type { RecentItem } from '../../preload/api'
import { useI18n } from '../i18n'

interface Props {
  recent: RecentItem[]
  /** Bundled examples, pinned above the recent files. */
  examples: { id: string; name: string; detail: string }[]
  onOpenExample: (id: string) => void
  /** Guided exercises, from first steps to parametric programs. */
  exercises: { id: string; name: string; level: number; detail: string }[]
  onOpenExercise: (id: string) => void
  onNew: () => void
  onPick: () => void
  onOpenRecent: (item: RecentItem) => void
  onRemoveRecent: (item: RecentItem) => void
}

/** Shown when no program is open: actions on the left, recent files (example pinned first) on the right. */
export function StartScreen({ recent, examples, onOpenExample, exercises, onOpenExercise, onNew, onPick, onOpenRecent, onRemoveRecent }: Props) {
  const { t, lang } = useI18n()
  const when = (ms: number) => new Date(ms).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })

  return (
    <main className="start">
      <section className="start-actions">
        <h2>{t('start.begin')}</h2>
        <button className="btn primary" onClick={onPick}>{t('action.openProgram')}…</button>
        <button className="btn" onClick={onNew}>{t('action.newProgram')}</button>
        {exercises.length > 0 && (
          <>
            <h2 className="start-learn">{t('exercise.title')}</h2>
            <p className="muted small">{t('exercise.intro')}</p>
            <ul className="start-exercises">
              {exercises.map((ex) => (
                <li key={ex.id}>
                  <button className="recent-item" title={ex.detail} onClick={() => onOpenExercise(ex.id)}>
                    <span className="recent-name">{ex.name}</span>
                    <span className="muted">{t('exercise.level', { level: ex.level })}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="start-recent">
        <h2>{t('start.recent')}</h2>
        <ul>
          {examples.map((ex) => (
            <li key={ex.id}>
              <button className="recent-item" onClick={() => onOpenExample(ex.id)}>
                <span className="recent-name">
                  {ex.name} <span className="tag">{t('start.example')}</span>
                </span>
                <span className="muted">{ex.detail}</span>
              </button>
            </li>
          ))}
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
