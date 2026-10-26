import type { RecentItem } from '../../preload/api'
import { useI18n } from '../i18n'

/** Lists of the start screen, one per tab. */
export type StartSection = 'recent' | 'examples' | 'exercises'

interface Props {
  section: StartSection
  onSection: (section: StartSection) => void
  recent: RecentItem[]
  /** Bundled examples (projects) and guided exercises. */
  examples: { id: string; name: string; detail: string; machine: string }[]
  exercises: { id: string; name: string; level: number; detail: string }[]
  onNew: () => void
  onOpen: () => void
  onOpenRecent: (item: RecentItem) => void
  onRemoveRecent: (item: RecentItem) => void
  onOpenExample: (id: string) => void
  onOpenExercise: (id: string) => void
}

/** A project (.cncsim) keeps machine, stock and tools with the program; a program is only G-code. */
export function FileIcon({ kind }: { kind: 'project' | 'program' | 'exercise' }) {
  if (kind === 'project')
    return (
      <svg className="file-icon project" viewBox="0 0 24 24" aria-hidden>
        <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5Z" />
        <path d="M8 16.5h8M8 13h5" />
      </svg>
    )
  if (kind === 'exercise')
    return (
      <svg className="file-icon exercise" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 4 2.5 8.5 12 13l9.5-4.5Z" />
        <path d="M6.5 10.5v4.5c3 2.4 8 2.4 11 0v-4.5" />
      </svg>
    )
  return (
    <svg className="file-icon program" viewBox="0 0 24 24" aria-hidden>
      <path d="M6 3h8.5L19 7.5V21H6Z" />
      <path d="M14 3v5h5M9 12h7M9 15h7M9 18h4" />
    </svg>
  )
}

/** Start screen, laid out like an office suite's File page: actions on the left, one list per tab. */
export function StartScreen(props: Props) {
  const { section, onSection, recent, examples, exercises, onNew, onOpen, onOpenRecent, onRemoveRecent, onOpenExample, onOpenExercise } = props
  const { t, lang } = useI18n()
  const when = (ms: number) => new Date(ms).toLocaleString(lang, { dateStyle: 'short', timeStyle: 'short' })
  const tabs: { id: StartSection; label: string; count: number }[] = [
    { id: 'recent', label: t('start.recent'), count: recent.length },
    { id: 'examples', label: t('start.examples'), count: examples.length },
    { id: 'exercises', label: t('exercise.title'), count: exercises.length }
  ]

  return (
    <main className="backstage">
      <nav className="backstage-nav">
        <button className="btn primary" onClick={onNew}>{t('action.newProgram')}…</button>
        <button className="btn" onClick={onOpen}>{t('action.open')}…</button>
        <p className="muted small">{t('start.fileTypes')}</p>
      </nav>

      <section className="backstage-main">
        <div className="backstage-tabs" role="tablist">
          {tabs.map((tab) => (
            <button key={tab.id} role="tab" aria-selected={section === tab.id} className={section === tab.id ? 'on' : ''} onClick={() => onSection(tab.id)}>
              {tab.label}
              <span className="count">{tab.count}</span>
            </button>
          ))}
        </div>

        {section === 'recent' && (
          <ul className="file-list">
            {recent.map((item) => (
              <li key={item.path} className={item.missing ? 'missing' : ''}>
                <button className="file-item" disabled={item.missing} onClick={() => onOpenRecent(item)}>
                  <FileIcon kind={item.kind} />
                  <span className="file-text">
                    <span className="file-name">{item.name}</span>
                    <span className="muted">
                      {t(item.kind === 'project' ? 'file.project' : 'file.program')} · {item.missing ? t('start.missing') : window.api ? item.path : t('start.browserCopy')}
                    </span>
                  </span>
                  <span className="muted when">{when(item.openedAt)}</span>
                </button>
                <button className="btn tiny remove" title={t('start.remove')} aria-label={t('start.remove')} onClick={() => onRemoveRecent(item)}>
                  ×
                </button>
              </li>
            ))}
            {!recent.length && <p className="muted empty">{t('start.empty')}</p>}
          </ul>
        )}

        {section === 'examples' && (
          <ul className="file-list">
            {examples.map((ex) => (
              <li key={ex.id}>
                <button className="file-item" onClick={() => onOpenExample(ex.id)}>
                  <FileIcon kind="project" />
                  <span className="file-text">
                    <span className="file-name">{ex.name}</span>
                    <span className="muted">{ex.detail}</span>
                  </span>
                  <span className="muted when">{ex.machine}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {section === 'exercises' && (
          <>
            <p className="muted small">{t('exercise.intro')}</p>
            <ul className="file-list">
              {exercises.map((ex) => (
                <li key={ex.id}>
                  <button className="file-item" onClick={() => onOpenExercise(ex.id)}>
                    <FileIcon kind="exercise" />
                    <span className="file-text">
                      <span className="file-name">{ex.name}</span>
                      <span className="muted">{ex.detail}</span>
                    </span>
                    <span className="muted when">{t('exercise.level', { level: ex.level })}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </main>
  )
}
