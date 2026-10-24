// Learning help over the program: what a word does on the selected control, and every word of a block.
import type { Control } from '@core/index'
import type { LocalizedText } from '@i18n/index'
import { HELP } from '@i18n/help'

type Localize = (text: LocalizedText | undefined) => string

/** One explained word of a block. */
export interface WordHelp {
  word: string
  text: string
}

const MACRO_WORD = /\b(IF|WHILE|GOTO|THEN|DO|END|EQ|NE|GT|LT|GE|LE)\b/gi
const COMPARE = new Set(['EQ', 'NE', 'GT', 'LT', 'GE', 'LE'])
/** G and M codes, numbered variables and macro words: the words that get a tooltip on the program screen. */
export const HELP_TOKEN = /(#\d+)|((?<![A-Z#])[GM]\s*\d+(?:\.\d+)?)|\b(IF|WHILE|GOTO|EQ|NE|GT|LT|GE|LE)\b/gi

/** The control's table key for a code as written: G1 → G01, M3 → M03, G12.1 stays. */
function codeKey(letter: string, num: string): string[] {
  const [int = '', frac] = num.split('.')
  const n = String(Number(int))
  const padded = n.padStart(2, '0')
  const keys = [`${letter}${padded}${frac !== undefined ? `.${frac}` : ''}`, `${letter}${n}${frac !== undefined ? `.${frac}` : ''}`]
  return [...new Set(keys)]
}

function variableKind(n: number): string {
  if (n === 0) return 'var:null'
  if (n <= 33) return 'var:local'
  if (n >= 1000) return 'var:system'
  return 'var:common'
}

/** What one word does on this control: a G or M code, a #variable, a macro word or an address letter. */
export function helpForWord(word: string, control: Control | undefined, l: Localize): string | undefined {
  const w = word.toUpperCase().replace(/\s+/g, '')
  const v = /^#(\d+)$/.exec(w)
  if (v) return l(HELP[variableKind(Number(v[1]))])
  if (COMPARE.has(w)) return l(HELP['macro:compare'])
  if (w === 'IF' || w === 'WHILE' || w === 'GOTO') return l(HELP[`macro:${w}`])
  const c = /^([GM])(\d+(?:\.\d+)?)$/.exec(w)
  if (c?.[1] && c[2]) {
    const letter = c[1]
    const table: Record<string, { function: string; description?: LocalizedText }> = letter === 'G' ? (control?.gCodes ?? {}) : (control?.mCodes ?? {})
    const key = codeKey(letter, c[2]).find((k) => table[k])
    const entry = key ? table[key] : undefined
    const kind = letter === 'G' ? 'g' : 'm'
    if (!entry) return l(HELP[`${kind}:unknown`])
    const text = l(HELP[`${kind}:${entry.function}`] ?? HELP[`${kind}:other`])
    const own = entry.description ? l(entry.description) : ''
    return own && own !== text ? `${own}. ${text}` : text
  }
  const a = /^,?([A-Z])$/.exec(w)
  if (a?.[1]) return HELP[`addr:${a[1]}`] ? l(HELP[`addr:${a[1]}`]) : undefined
  return undefined
}

/** Every word of a block with its help, in the order: codes, macro words, variables, then addresses. */
export function explainLine(line: string, control: Control | undefined, l: Localize): WordHelp[] {
  // Comments and the end-of-block mark say nothing to the control
  const text = line.replace(/\([^)]*\)?/g, ' ').replace(/;.*$/, '').toUpperCase()
  const out: WordHelp[] = []
  const seen = new Set<string>()
  const add = (word: string) => {
    if (seen.has(word)) return
    seen.add(word)
    const h = helpForWord(word, control, l)
    if (h) out.push({ word, text: h })
  }
  for (const m of text.matchAll(/(?<![A-Z#])([GM])\s*(\d+(?:\.\d+)?)/g)) add(`${m[1] ?? ''}${m[2] ?? ''}`)
  for (const m of text.matchAll(MACRO_WORD)) if (m[1] && !['THEN', 'DO', 'END'].includes(m[1])) add(m[1])
  for (const m of text.matchAll(/#(\d+)/g)) add(`#${m[1] ?? ''}`)
  // Addresses: the letters left once codes, macro words and functions are taken out
  const rest = text.replace(MACRO_WORD, ' ').replace(/\b[A-Z]{2,}\b/g, ' ').replace(/#\d+/g, ' ')
  for (const m of rest.matchAll(/(?<![A-Z#])(,?[XYZUWCAIJKRFSTHDPQLNO])\s*(?=[-+.\d[#])/g)) add(m[1] ?? '')
  return out
}
