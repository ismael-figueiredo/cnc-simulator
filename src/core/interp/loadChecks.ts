// What the control verifies when the file comes in, before the program runs.
import type { Block, ParsedProgram } from '../program/parse'
import type { Severity } from '../types'
import type { DiagnosticCode } from './diagnostics'

export interface FileFormat {
  startPercent: boolean
  endPercent: boolean
  eob: 'semicolon' | 'newline'
  missingEob: 'alarm' | 'warning' | 'off'
  programNumber: 'required' | 'optional'
}

export interface LoadIssue {
  line: number
  severity: Severity
  code: DiagnosticCode
  params?: Record<string, string | number>
}

/** Reported issues of the file's layout; the program still runs after them. */
export function loadIssues(layout: ParsedProgram['layout'], blocks: readonly Block[], format: FileFormat): LoadIssue[] {
  const issues: LoadIssue[] = []
  if (format.startPercent && !layout.startPercent) issues.push({ line: 0, severity: 'alarm', code: 'file-start-percent-missing' })
  if (format.endPercent && !layout.endPercent) issues.push({ line: layout.endLine, severity: 'alarm', code: 'file-end-percent-missing' })
  if (format.eob === 'semicolon' && format.missingEob !== 'off')
    for (const line of layout.missingEob) issues.push({ line, severity: format.missingEob === 'alarm' ? 'alarm' : 'warning', code: 'eob-missing' })
  for (const line of layout.unclosedComments) issues.push({ line, severity: 'warning', code: 'unclosed-comment' })
  const first = blocks[0]
  if (format.programNumber === 'required' && first?.programNumber === undefined) issues.push({ line: first?.line ?? 0, severity: 'warning', code: 'program-number-missing' })
  return issues
}

/** The first program number out of range (O0 or above the control's maximum), which stops the load. */
export const illegalProgramNumber = (blocks: readonly Block[], max: number): Block | undefined =>
  blocks.find((b) => b.programNumber !== undefined && (b.programNumber < 1 || b.programNumber > max))
