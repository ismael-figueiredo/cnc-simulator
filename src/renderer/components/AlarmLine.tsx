import type { Diagnostic } from '@core/index'
import { useI18n } from '../i18n'

/**
 * The alarm that stopped the program, across the whole width as on the control: number and short
 * text; the full message is on the MESSAGE page (and in the feature tree). Click goes to the block.
 */
export function AlarmLine({ alarm, onGo }: { alarm: Diagnostic | undefined; onGo: (d: Diagnostic) => void }) {
  const { t } = useI18n()
  if (!alarm) return null
  return (
    <button className="alarm-line" title={t('alarm.goHint')} onClick={() => onGo(alarm)}>
      <b>ALM</b>
      <span className="code">{alarm.alarm?.code ?? t('severity.alarm')}</span>
      <span className="text">{alarm.alarm?.message ?? t(`diag.${alarm.code}`, alarm.params)}</span>
      <span className="where">{t('alarm.line', { line: alarm.line + 1 })}</span>
    </button>
  )
}
