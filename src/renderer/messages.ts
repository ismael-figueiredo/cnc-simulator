import type { ConfigIssue, Diagnostic, Severity } from '@core/index'
import type { MessageKey, Params } from '@i18n/index'

const SEVERITY_ORDER: Record<Severity, number> = { alarm: 0, warning: 1, info: 2 }

/** Alarms first, then warnings, then information; by line within each. */
export const sortDiagnostics = (list: readonly Diagnostic[]): Diagnostic[] =>
  list.slice().sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.line - b.line)

/** The worst severity on each line, for the marks beside the program. */
export function lineMarks(list: readonly Diagnostic[]): Map<number, Severity> {
  const marks = new Map<number, Severity>()
  for (const d of list) {
    const prev = marks.get(d.line)
    if (!prev || SEVERITY_ORDER[d.severity] < SEVERITY_ORDER[prev]) marks.set(d.line, d.severity)
  }
  return marks
}

/** A config file that did not load, as one line of text. */
export const configIssueText = (t: (key: MessageKey, params?: Params) => string, i: ConfigIssue) =>
  i.kind === 'invalid-json'
    ? t('config.invalidJson', { source: i.source, message: i.message })
    : t('config.issue', { source: i.source, path: i.path || t('config.root'), message: i.message })
