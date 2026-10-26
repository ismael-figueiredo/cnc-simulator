// A block's words ("G01", "X-12.5", "S2=1200", ",R2") with the control's format checks.
import type { Control } from '../config/schema'
import type { Expr, Value } from '../macro/expr'
import type { DiagnosticCode } from './diagnostics'

export interface Word {
  addr: string
  value: Value
  literal: boolean
  dot: boolean
  /** "S2=1200" → 2 */
  spindle?: number
}

/** Raises a check that stops the block (the interpreter's alarm). */
export type Fail = (code: DiagnosticCode, params?: Record<string, string | number>) => never

/** Addresses that take no minus sign, and no decimal point (Fanuc alarms 006 / 007). */
const NO_NEGATIVE = new Set('GMNOSTFPLDH')
const NO_DECIMAL = new Set('MNOTLDHPS')
/** Addresses that take a dimension (decimal point check, value range). */
export const DIMENSION = 'XYZUVWABCIJKR'
const VALID_CHARS = /^[A-Z0-9.+\-*/#[\]=,]*$/

export interface WordOptions {
  /** "M3.5": an alarm, or the integer part is kept. */
  integerDecimal: NonNullable<Control['dialect']['integerAddressDecimal']>
  maxDigits: number
}

export function createWordReader(ex: Expr, fail: Fail, { integerDecimal, maxDigits }: WordOptions) {
  /** The value after an address at s[i]: a number, or a variable / bracket expression. */
  function valueAt(s: string, i: number, addr: string): { v: Value; i: number; literal: boolean; dot: boolean } {
    const c = s[i]
    if (c === undefined || /[A-Z,]/.test(c)) fail('no-data-after-address', { addr })
    let sign = 1
    if (c === '-' || c === '+') {
      if (c === '-' && NO_NEGATIVE.has(addr)) fail('illegal-negative-sign', { addr })
      if (s[i + 1] === '-' || s[i + 1] === '+') fail('illegal-negative-sign', { addr })
      sign = c === '-' ? -1 : 1
      i++
      if (s[i] === undefined || /[A-Z,]/.test(s[i] ?? '')) fail('no-data-after-address', { addr })
    }
    if (s[i] === '#' || s[i] === '[') {
      const v = ex.at(s, i).primary()
      return { v: v === null ? null : sign * v, i: ex.pos, literal: false, dot: false }
    }
    const m = /^[\d.]+/.exec(s.slice(i))
    if (!m) fail('no-data-after-address', { addr })
    const lit = m[0]
    const dots = lit.split('.').length - 1
    const integerOnly = dots === 1 && NO_DECIMAL.has(addr)
    if (dots > 1 || (integerOnly && integerDecimal === 'alarm')) fail('illegal-decimal-point', { addr })
    const digits = lit.replace('.', '').replace(/^0+(?=\d)/, '').length
    if (digits > maxDigits) fail('too-many-digits', { addr, max: maxDigits })
    // Controls that accept "M3.5" keep only the integer part
    const value = integerOnly ? Math.trunc(parseFloat(lit)) : parseFloat(lit)
    return { v: sign * value, i: i + lit.length, literal: true, dot: dots === 1 && !integerOnly }
  }

  /** All the words of a block's text (upper case, no spaces). */
  function parseWords(s: string): Word[] {
    const bad = VALID_CHARS.test(s) ? null : /[^A-Z0-9.+\-*/#[\]=,]/.exec(s)
    if (bad) fail('invalid-character', { char: bad[0] })
    if (/^[\d.+-]/.test(s)) fail('address-not-found')
    const words: Word[] = []
    let i = 0
    while (i < s.length) {
      const c = s[i] as string
      if (c === ',') {
        // ",R" / ",C" direct corner rounding or chamfer
        const L = s[i + 1] ?? ''
        const v = ex.at(s, i + 2).unary()
        i = ex.pos
        words.push({ addr: ',' + L, value: v, literal: false, dot: false })
        continue
      }
      if (!/[A-Z]/.test(c)) fail('address-not-found')
      i++
      const spindle = /^(\d)=/.exec(s.slice(i))
      if (c === 'S' && spindle) {
        i += 2
        const r = valueAt(s, i, 'S')
        i = r.i
        words.push({ addr: 'S', value: r.v, literal: r.literal, dot: r.dot, spindle: Number(spindle[1]) })
        continue
      }
      const r = valueAt(s, i, c)
      i = r.i
      words.push({ addr: c, value: r.v, literal: r.literal, dot: r.dot })
    }
    return words
  }

  return { valueAt, parseWords }
}
