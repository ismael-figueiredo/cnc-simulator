import type { AlarmCatalog } from '../config/schema'
import type { MachineAlarm } from '../types'
import type { DiagnosticCode } from './diagnostics'

/** The control's alarm for a check, when its catalog maps it (e.g. "PS0010 IMPROPER G-CODE"). */
export function machineAlarm(catalog: AlarmCatalog | null, code: DiagnosticCode, params?: Record<string, string | number>): MachineAlarm | undefined {
  if (!catalog) return undefined
  let num = catalog.map[code]
  let message = num !== undefined ? (catalog.alarms[String(num)] ?? '') : ''
  if (code === 'macro-alarm') {
    // Fanuc: alarm base + n with the block comment; Mitsubishi: one fixed alarm (P277) with the comment
    if (catalog.macroAlarmBase !== undefined) num = catalog.macroAlarmBase + Number(params?.['num'] ?? 0)
    const comment = String(params?.['comment'] ?? '')
    if (comment) message = comment
  }
  if (num === undefined) return undefined
  return { code: catalog.prefix + String(num).padStart(catalog.digits, '0'), message, stops: true }
}
