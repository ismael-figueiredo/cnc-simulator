// Starting programs for File > New: a safe header written with the selected control's own codes
// (looked up by function, so Fanuc and Mitsubishi tables both work), and optionally a parametric
// body in Macro B. The UI passes the comments in the user's language.
import { isLatheControl } from './config/kinds'
import type { Control, Machine } from './config/schema'

export type ProgramKind = 'plain' | 'parametric'

/** Comment texts, already in the user's language. */
export interface TemplateTexts {
  newProgram: string
  workZero: string
  latheZero: string
  tool: string
  machineHere: string
  parameters: string
  passes: string
  length: string
  stepDown: string
  totalDepth: string
  feed: string
  startDiameter: string
  finalDiameter: string
}

/** Comments are kept plain ASCII uppercase: old controls reject accents and lower case. */
const comment = (s: string) =>
  `(${s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[()]/g, '')
    .replace(/[^\x20-\x7e]/g, '-')})`

/** Codes shops expect when a control has several for the same function (Romi D: M07 mist, M08 flood). */
const PREFERRED: Record<string, string> = { 'coolant-on': 'M08' }

/** Code of the control that does the function, e.g. "M06" for tool-change; '' when the control has none. */
function code(table: Record<string, { function: string }>, fn: string): string {
  const all = Object.entries(table).filter(([, def]) => def.function === fn)
  return (all.find(([c]) => c === PREFERRED[fn]) ?? all[0])?.[0] ?? ''
}

export const supportsMacro = (control: Control) => control.dialect.macro !== 'none'

export function programTemplate(machine: Machine, control: Control, kind: ProgramKind, number: number, tx: TemplateTexts): string {
  const g = (fn: string) => code(control.gCodes, fn)
  const m = (fn: string) => code(control.mCodes, fn)
  const words = (...w: string[]) => w.filter(Boolean).join(' ')
  const lathe = isLatheControl(control)
  const o = `O${String(number).padStart(4, '0')}`
  const parametric = kind === 'parametric' && supportsMacro(control)

  const lines: string[] = ['%', `${o} ${comment(tx.newProgram)}`, comment(`${machine.name} - ${control.name}`)]
  if (lathe) {
    lines.push(
      comment(tx.latheZero),
      words(g('metric'), g('plane-zx'), g('cutter-comp-cancel'), g('feed-per-rev')),
      comment(`T01 - ${tx.tool}`),
      'T0101',
      words(g('constant-rpm'), 'S1000', m('spindle-cw')),
      words(g('rapid'), 'X100.', 'Z5.', m('coolant-on'))
    )
    if (parametric)
      lines.push(
        comment(tx.parameters),
        `#100=40. ${comment(tx.length)}`,
        `#101=2. ${comment(tx.stepDown)}`,
        `#102=50. ${comment(tx.startDiameter)}`,
        `#103=40. ${comment(tx.finalDiameter)}`,
        `#104=0.2 ${comment(tx.feed)}`,
        comment(tx.passes),
        '#110=#102',
        'WHILE[#110 GT #103] DO1',
        '#110=#110-#101',
        'IF[#110 LT #103] THEN #110=#103',
        words(g('rapid'), 'X#110', 'Z2.'),
        words(g('linear'), 'Z-#100', 'F#104'),
        words(g('rapid'), 'X[#110+2.]'),
        words(g('rapid'), 'Z2.'),
        'END1'
      )
    else lines.push(comment(tx.machineHere), '')
    lines.push(words(g('rapid'), g('machine-coords'), 'X0', 'Z0', m('coolant-off')), m('spindle-stop'))
  } else {
    lines.push(
      comment(`${tx.workZero}: ${g('work-offset') || 'G54'}`),
      words(g('metric'), g('plane-xy'), g('cutter-comp-cancel'), g('tool-length-comp-cancel'), g('canned-cycle-cancel'), g('absolute')),
      comment(`T1 - ${tx.tool}`),
      words('T1', m('tool-change')),
      words(g('work-offset'), g('rapid'), g('absolute'), 'X0', 'Y0', 'S1000', m('spindle-cw')),
      words(g('tool-length-comp'), 'Z50.', g('tool-length-comp') ? 'H1' : '', m('coolant-on'))
    )
    if (parametric)
      lines.push(
        comment(tx.parameters),
        `#100=80. ${comment(tx.length)}`,
        `#101=1. ${comment(tx.stepDown)}`,
        `#102=3. ${comment(tx.totalDepth)}`,
        `#103=500. ${comment(tx.feed)}`,
        comment(tx.passes),
        '#110=0',
        'WHILE[#110 LT #102] DO1',
        '#110=#110+#101',
        'IF[#110 GT #102] THEN #110=#102',
        words(g('rapid'), 'X0', 'Y0', 'Z2.'),
        words(g('linear'), 'Z-#110', 'F#103'),
        words(g('linear'), 'X#100'),
        words(g('rapid'), 'Z5.'),
        'END1'
      )
    else lines.push(comment(tx.machineHere), '')
    lines.push(
      words(g('rapid'), 'Z50.', m('coolant-off')),
      m('spindle-stop'),
      words(g('incremental'), g('reference-return'), 'Z0'),
      g('absolute')
    )
  }
  lines.push(m('end-rewind') || m('end'), '%')

  // Blocks end with ";" where the control's file format asks for it
  const eob = control.fileFormat?.eob === 'semicolon' ? ';' : ''
  return `${lines
    .filter((l, i) => l !== '' || lines[i - 1] !== '')
    .map((l) => (l === '%' || l === '' ? l : `${l}${eob}`))
    .join('\n')}\n`
}
