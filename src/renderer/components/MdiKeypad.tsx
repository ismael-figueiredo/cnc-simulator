import { Fragment } from 'react'
import type { MessageKey } from '@i18n/index'
import { useI18n } from '../i18n'
import type { FunctionKey } from './SoftKeys'

interface Props {
  /** Function key of the page on screen (lit). */
  current: FunctionKey
  onFunction: (key: FunctionKey) => void
  /** Messages waiting / an alarm: the MESSAGE key lights up. */
  alarm: boolean
  messages: number
  onReset: () => void
  /** Cursor keys: one block back or forward; PAGE: several. */
  onStep: (blocks: number) => void
  onHelp: () => void
}

// Address and number keys, as on the panel; they only type in EDIT on the machine, here they explain themselves
const ADDRESS = ['O', 'N', 'G', '7', '8', '9', 'X', 'Y', 'Z', '4', '5', '6', 'M', 'S', 'T', '1', '2', '3', 'F', 'H', 'EOB', '-', '0', '.']
const FUNCTIONS: { key: FunctionKey; hint: MessageKey }[] = [
  { key: 'POS', hint: 'mdi.pos' },
  { key: 'PROG', hint: 'mdi.prog' },
  { key: 'OFS/SET', hint: 'mdi.ofs' },
  { key: 'SYSTEM', hint: 'mdi.system' },
  { key: 'MESSAGE', hint: 'mdi.message' },
  { key: 'GRAPH', hint: 'mdi.graph' }
]

/** The MDI keyboard beside the display: address and number keys, function keys, editing keys, RESET and the cursor. */
export function MdiKeypad({ current, onFunction, alarm, messages, onReset, onStep, onHelp }: Props) {
  const { t } = useI18n()
  return (
    <div className="mdi" aria-label={t('mdi.title')}>
      <div className="mdi-grid address">
        {ADDRESS.map((k) => (
          <button key={k} className="mdi-key" title={t('mdi.addressHint')} tabIndex={-1}>
            {k}
          </button>
        ))}
      </div>
      <div className="mdi-grid functions">
        {/* As on the panel: three function keys and three editing keys per row */}
        {[FUNCTIONS.slice(0, 3), FUNCTIONS.slice(3)].map((row, r) => (
          <Fragment key={r}>
            {row.map((f) => (
              <button
                key={f.key}
                className={['mdi-key', 'fn', f.key === current ? 'on' : '', f.key === 'MESSAGE' && alarm ? 'alm' : ''].filter(Boolean).join(' ')}
                title={t(f.hint)}
                onClick={() => onFunction(f.key)}
              >
                {f.key}
                {f.key === 'MESSAGE' && messages > 0 && <i className="led" />}
              </button>
            ))}
            {(r === 0 ? ['SHIFT', 'CAN', 'INPUT'] : ['ALTER', 'INSERT', 'DELETE']).map((k) => (
              <button key={k} className="mdi-key edit" title={t('mdi.editHint')} tabIndex={-1}>
                {k}
              </button>
            ))}
          </Fragment>
        ))}
      </div>
      <div className="mdi-bottom">
        <button className="mdi-key reset" title={t('mdi.reset')} onClick={onReset}>RESET</button>
        <button className="mdi-key" title={t('tour.start')} onClick={onHelp}>HELP</button>
        <div className="mdi-cursor" role="group" aria-label={t('mdi.cursor')}>
          <button className="mdi-key" title={t('mdi.pageUp')} onClick={() => onStep(-10)}>PAGE ↑</button>
          <button className="mdi-key arrow" title={t('player.back')} onClick={() => onStep(-1)}>↑</button>
          <button className="mdi-key" title={t('mdi.pageDown')} onClick={() => onStep(10)}>PAGE ↓</button>
          <button className="mdi-key arrow" title={t('player.back')} onClick={() => onStep(-1)}>←</button>
          <button className="mdi-key arrow" title={t('player.forward')} onClick={() => onStep(1)}>↓</button>
          <button className="mdi-key arrow" title={t('player.forward')} onClick={() => onStep(1)}>→</button>
        </div>
      </div>
    </div>
  )
}
