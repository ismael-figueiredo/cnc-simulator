import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'

interface Props {
  learn: boolean
  onLearn: (on: boolean) => void
  onTour: () => void
  onShortcuts: () => void
}

/** A small "?" in the corner: tour, learning mode and keyboard shortcuts. */
export function HelpMenu({ learn, onLearn, onTour, onShortcuts }: Props) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  // A click anywhere else closes it
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])
  const pick = (action: () => void) => () => {
    setOpen(false)
    action()
  }
  return (
    <div className="help-menu" ref={box}>
      <button className="help-icon" aria-haspopup="menu" aria-expanded={open} title={t('help.title')} aria-label={t('help.title')} onClick={() => setOpen(!open)}>
        ?
      </button>
      {open && (
        <div className="dropdown" role="menu">
          <button role="menuitem" onClick={pick(onTour)}>{t('tour.start')}</button>
          <button role="menuitemcheckbox" aria-checked={learn} onClick={pick(() => onLearn(!learn))}>
            {learn ? '✓ ' : ''}
            {t('help.learn')}
          </button>
          <button role="menuitem" onClick={pick(onShortcuts)}>{t('help.shortcuts')}</button>
        </div>
      )}
    </div>
  )
}

/** Keyboard shortcuts, as a small dialog. */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  const mod = window.api?.platform === 'darwin' ? '⌘' : 'Ctrl'
  const rows: [string, string][] = [
    [`${mod}+N`, t('action.newProgram')],
    [`${mod}+O`, t('action.open')],
    [`${mod}+S`, t('menu.save')],
    [`${mod}+Shift+S`, t('menu.saveAs')],
    [`${mod}+W`, t('menu.closeTab')],
    [t('keys.space'), 'CYCLE START / FEED HOLD'],
    ['Esc', 'RESET'],
    ['S', t('panel.singleBlock')],
    ['F', t('view.fitHint')],
    [`${mod}+F`, t('keys.find')]
  ]
  return (
    <div className="modal-backdrop" role="dialog" aria-modal aria-label={t('help.shortcuts')} onClick={onClose}>
      <div className="modal shortcuts" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{t('help.shortcuts')}</h2>
        </header>
        <table className="table">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td><kbd>{k}</kbd></td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <footer>
          <button className="btn primary" onClick={onClose}>{t('common.close')}</button>
        </footer>
      </div>
    </div>
  )
}
