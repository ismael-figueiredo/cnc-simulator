import { Fragment, useState } from 'react'
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
  /** Address and number keys type into the program (EDIT); CAN erases, DELETE removes the block. */
  onType: (text: string) => void
  onCancel: () => void
  onDeleteBlock: () => void
}

// Address and number keys as on the panel, each with its SHIFT character (the small one on the key)
const ADDRESS: [string, string][] = [
  ['O', 'P'], ['N', 'Q'], ['G', 'R'], ['7', 'A'], ['8', 'B'], ['9', 'D'],
  ['X', 'C'], ['Y', 'U'], ['Z', 'W'], ['4', '['], ['5', ']'], ['6', '#'],
  ['M', 'I'], ['S', 'J'], ['T', 'K'], ['1', ','], ['2', '='], ['3', '*'],
  ['F', 'L'], ['H', 'E'], ['EOB', ';'], ['-', '+'], ['0', '/'], ['.', ' ']
]
const FUNCTIONS: { key: FunctionKey; hint: MessageKey }[] = [
  { key: 'POS', hint: 'mdi.pos' },
  { key: 'PROG', hint: 'mdi.prog' },
  { key: 'OFS/SET', hint: 'mdi.ofs' },
  { key: 'SYSTEM', hint: 'mdi.system' },
  { key: 'MESSAGE', hint: 'mdi.message' },
  { key: 'GRAPH', hint: 'mdi.graph' }
]

/** The MDI keyboard beside the display: address and number keys, function keys, editing keys, RESET and the cursor. */
export function MdiKeypad({ current, onFunction, alarm, messages, onReset, onStep, onHelp, onType, onCancel, onDeleteBlock }: Props) {
  const { t } = useI18n()
  /** SHIFT: the next key gives its small character. */
  const [shift, setShift] = useState(false)
  const press = (main: string, alt: string) => {
    const k = shift ? alt : main
    setShift(false)
    onType(k === 'EOB' ? 'EOB' : k)
  }
  return (
    <div className="mdi" aria-label={t('mdi.title')}>
      <div className="mdi-grid address">
        {ADDRESS.map(([main, alt]) => (
          <button key={main} className="mdi-key" title={t('mdi.addressHint')} tabIndex={-1} onClick={() => press(main, alt)}>
            <span className={shift ? 'dim' : ''}>{main}</span>
            <small className={shift ? 'lit' : ''}>{alt === ' ' ? 'SP' : alt}</small>
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
              <button
                key={k}
                className={`mdi-key edit ${k === 'SHIFT' && shift ? 'on' : ''}`}
                title={t(k === 'SHIFT' ? 'mdi.shiftHint' : k === 'CAN' ? 'mdi.canHint' : k === 'DELETE' ? 'mdi.deleteHint' : 'mdi.editHint')}
                tabIndex={-1}
                onClick={() => {
                  if (k === 'SHIFT') setShift(!shift)
                  else if (k === 'CAN') onCancel()
                  else if (k === 'DELETE') onDeleteBlock()
                }}
              >
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
