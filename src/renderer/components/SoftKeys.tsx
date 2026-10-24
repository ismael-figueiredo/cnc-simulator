import type { MessageKey } from '@i18n/index'
import { useI18n } from '../i18n'

/** Screens of the machine layout, picked with the soft keys under the display. */
export type Screen = 'pos' | 'prog' | 'offset' | 'graph' | 'msg' | 'setting'

const KEYS: { screen: Screen; label: MessageKey; hint: MessageKey }[] = [
  { screen: 'pos', label: 'softkey.pos', hint: 'softkey.posHint' },
  { screen: 'prog', label: 'softkey.prog', hint: 'softkey.progHint' },
  { screen: 'offset', label: 'softkey.offset', hint: 'softkey.offsetHint' },
  { screen: 'graph', label: 'softkey.graph', hint: 'softkey.graphHint' },
  { screen: 'msg', label: 'softkey.msg', hint: 'softkey.msgHint' },
  { screen: 'setting', label: 'softkey.setting', hint: 'softkey.settingHint' }
]

interface Props {
  screen: Screen
  onScreen: (screen: Screen) => void
  /** Messages waiting, and whether one of them is an alarm: the MSG key lights up. */
  messages: number
  alarm: boolean
}

/** The row of keys under the control's display that switch screens. */
export function SoftKeys({ screen, onScreen, messages, alarm }: Props) {
  const { t } = useI18n()
  return (
    <div className="mp-softkeys" role="tablist">
      {KEYS.map((k) => (
        <button
          key={k.screen}
          role="tab"
          aria-selected={screen === k.screen}
          className={['softkey', screen === k.screen ? 'on' : '', k.screen === 'msg' && alarm ? 'alm' : ''].filter(Boolean).join(' ')}
          title={t(k.hint)}
          onClick={() => onScreen(k.screen)}
        >
          {t(k.label)}
          {k.screen === 'msg' && messages > 0 && <span className="count">{messages}</span>}
        </button>
      ))}
    </div>
  )
}
