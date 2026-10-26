import { useI18n } from '../i18n'

/** Pages of the machine screen, picked with the MDI function keys and the soft keys. */
export type Screen = 'pos' | 'prog' | 'graph' | 'offset' | 'work' | 'msg' | 'setting'

/** Function keys of the MDI panel, each opening a group of pages. */
export type FunctionKey = 'POS' | 'PROG' | 'OFS/SET' | 'SYSTEM' | 'MESSAGE' | 'GRAPH'

/** The page a function key opens first, and the soft keys of its group (labels as on the control). */
export const GROUPS: Record<FunctionKey, { page: Screen; keys: { label: string; page: Screen }[] }> = {
  POS: { page: 'pos', keys: [{ label: 'ALL', page: 'pos' }] },
  PROG: { page: 'prog', keys: [{ label: 'PROGRM', page: 'prog' }, { label: 'CHECK', page: 'graph' }] },
  'OFS/SET': { page: 'offset', keys: [{ label: 'OFFSET', page: 'offset' }, { label: 'WORK', page: 'work' }] },
  SYSTEM: { page: 'setting', keys: [{ label: 'SYSTEM', page: 'setting' }] },
  MESSAGE: { page: 'msg', keys: [{ label: 'ALARM', page: 'msg' }] },
  GRAPH: { page: 'graph', keys: [{ label: 'GRAPH', page: 'graph' }, { label: 'PROGRM', page: 'prog' }] }
}

/** Which function key a page belongs to. */
export const groupOf = (page: Screen): FunctionKey =>
  page === 'pos' ? 'POS' : page === 'prog' ? 'PROG' : page === 'offset' || page === 'work' ? 'OFS/SET' : page === 'setting' ? 'SYSTEM' : page === 'msg' ? 'MESSAGE' : 'GRAPH'

/** Soft keys: 10 under the display plus the return and continue keys, labels drawn on the screen's last row. */
export function SoftKeys({ group, screen, onScreen }: { group: FunctionKey; screen: Screen; onScreen: (screen: Screen) => void }) {
  const { t } = useI18n()
  const keys = GROUPS[group].keys
  const slots = Array.from({ length: 10 }, (_, i) => keys[i])
  return (
    <div className="softkeys" role="toolbar" aria-label={t('softkey.label')}>
      <button className="sk edge" disabled aria-hidden tabIndex={-1}>◁</button>
      {slots.map((k, i) =>
        k ? (
          <button key={i} className={`sk ${k.page === screen ? 'on' : ''}`} aria-pressed={k.page === screen} onClick={() => onScreen(k.page)}>
            <span>{k.label}</span>
          </button>
        ) : (
          <button key={i} className="sk" disabled aria-hidden tabIndex={-1}>
            <span />
          </button>
        )
      )}
      <button className="sk edge" disabled aria-hidden tabIndex={-1}>▷</button>
    </div>
  )
}
