// Fanuc Custom Macro B expressions: #variables, [ ] brackets, functions in degrees,
// EQ/NE/GT/GE/LT/LE, AND/OR/XOR/MOD. A null variable (#0, never set) reads as 0 in arithmetic.

export type Value = number | null

export interface VariableReader {
  get: (n: number) => Value
}

/** What went wrong, so the interpreter can raise the control's matching alarm. */
export type MacroErrorKind =
  | 'expression' // malformed formula
  | 'format' // malformed statement (IF without GOTO/THEN, WHILE without DO…)
  | 'division-by-zero'
  | 'unknown-word'
  | 'illegal-argument'
  | 'bracket-nesting'

export class MacroError extends Error {
  constructor(
    readonly kind: MacroErrorKind,
    readonly detail: string,
    readonly source: string
  ) {
    super(`${detail} in "${source}"`)
  }
}

const nz = (v: Value): number => v ?? 0
const D2R = Math.PI / 180
const deg = (r: number) => r / D2R

export class Expr {
  private s = ''
  private i = 0
  private depth = 0

  /** maxBrackets: nesting allowed for [ ] (Fanuc: 5). */
  constructor(
    private readonly vars: VariableReader,
    private readonly maxBrackets = 5
  ) {}

  /** Positions the parser on `s` at index `i`; returns this for chaining. */
  at(s: string, i: number): this {
    this.s = s
    this.i = i
    this.depth = 0
    return this
  }

  get pos(): number {
    return this.i
  }

  fail(kind: MacroErrorKind, detail: string): never {
    throw new MacroError(kind, detail, this.s)
  }

  private ch(): string | undefined {
    return this.s[this.i]
  }

  private rest(): string {
    return this.s.slice(this.i)
  }

  expect(c: string): void {
    if (this.s[this.i] !== c) this.fail('expression', `expected "${c}"`)
    this.i++
  }

  number(): number {
    const m = /^(\d+\.?\d*|\.\d+)/.exec(this.rest())
    if (!m) this.fail('expression', 'number expected')
    this.i += m[0].length
    return parseFloat(m[0])
  }

  private op(list: readonly string[]): string | null {
    const r = this.rest()
    for (const o of list) {
      if (r.startsWith(o)) {
        this.i += o.length
        return o
      }
    }
    return null
  }

  /** Full expression, including one comparison (used inside brackets and conditions). */
  compare(): Value {
    const a = this.add()
    const o = this.op(['EQ', 'NE', 'GE', 'GT', 'LE', 'LT'])
    if (!o) return a
    const b = this.add()
    if (o === 'EQ' || o === 'NE') {
      const eq =
        a === null || b === null
          ? a === null && b === null
          : Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b))
      return (o === 'EQ') === eq ? 1 : 0
    }
    const x = nz(a)
    const y = nz(b)
    const r = o === 'GT' ? x > y : o === 'GE' ? x >= y : o === 'LT' ? x < y : x <= y
    return r ? 1 : 0
  }

  private add(): Value {
    let a = this.mul()
    for (;;) {
      const c = this.ch()
      if (c === '+') {
        this.i++
        a = nz(a) + nz(this.mul())
        continue
      }
      if (c === '-') {
        this.i++
        a = nz(a) - nz(this.mul())
        continue
      }
      const o = this.op(['XOR', 'OR'])
      if (o === 'OR') {
        a = Math.trunc(nz(a)) | Math.trunc(nz(this.mul()))
        continue
      }
      if (o === 'XOR') {
        a = Math.trunc(nz(a)) ^ Math.trunc(nz(this.mul()))
        continue
      }
      return a
    }
  }

  private mul(): Value {
    let a = this.unary()
    for (;;) {
      const c = this.ch()
      if (c === '*') {
        this.i++
        a = nz(a) * nz(this.unary())
        continue
      }
      if (c === '/') {
        this.i++
        const b = nz(this.unary())
        if (b === 0) this.fail('division-by-zero', 'division by zero')
        a = nz(a) / b
        continue
      }
      const o = this.op(['AND', 'MOD'])
      if (o === 'AND') {
        a = Math.trunc(nz(a)) & Math.trunc(nz(this.unary()))
        continue
      }
      if (o === 'MOD') {
        const b = nz(this.unary())
        if (b === 0) this.fail('division-by-zero', 'MOD by zero')
        a = nz(a) % b
        continue
      }
      return a
    }
  }

  unary(): Value {
    const c = this.ch()
    if (c === '-') {
      this.i++
      return -nz(this.unary())
    }
    if (c === '+') {
      this.i++
      return this.unary()
    }
    return this.primary()
  }

  bracket(): Value {
    this.expect('[')
    if (++this.depth > this.maxBrackets) this.fail('bracket-nesting', `more than ${this.maxBrackets} levels of [ ]`)
    const v = this.compare()
    this.expect(']')
    this.depth--
    return v
  }

  /** "#123" or "#[expr]" → the variable number. */
  variableNumber(): number {
    this.expect('#')
    const n = this.ch() === '[' ? this.bracket() : this.number()
    return Math.round(nz(n))
  }

  primary(): Value {
    const c = this.ch()
    if (c === '[') return this.bracket()
    if (c === '#') return this.vars.get(this.variableNumber())
    if (c !== undefined && /[\d.]/.test(c)) return this.number()
    const m = /^[A-Z]+/.exec(this.rest())
    if (!m) this.fail('expression', 'invalid expression')
    const f = m[0]
    this.i += f.length
    if (this.ch() !== '[') this.fail('unknown-word', `${f} is not a macro function`)
    if (++this.depth > this.maxBrackets) this.fail('bracket-nesting', `more than ${this.maxBrackets} levels of [ ]`)
    this.i++
    const a = nz(this.compare())
    let b: number | null = null
    if (this.ch() === ',') {
      this.i++
      b = nz(this.compare())
    }
    this.expect(']')
    this.depth--
    // Fanuc two-argument form: ATAN[y]/[x]
    if (f === 'ATAN' && b === null && this.s[this.i] === '/' && this.s[this.i + 1] === '[') {
      this.i++
      b = nz(this.bracket())
    }
    switch (f) {
      case 'SIN':
        return Math.sin(a * D2R)
      case 'COS':
        return Math.cos(a * D2R)
      case 'TAN':
        if (Math.abs(Math.cos(a * D2R)) < 1e-12) this.fail('division-by-zero', `TAN[${a}]`)
        return Math.tan(a * D2R)
      case 'ASIN':
        if (Math.abs(a) > 1) this.fail('illegal-argument', `ASIN[${a}]`)
        return deg(Math.asin(a))
      case 'ACOS':
        if (Math.abs(a) > 1) this.fail('illegal-argument', `ACOS[${a}]`)
        return deg(Math.acos(a))
      case 'ATAN':
      case 'ATN': {
        if (b === null) return deg(Math.atan(a))
        const r = deg(Math.atan2(a, b))
        return r < 0 ? r + 360 : r
      }
      case 'SQRT':
      case 'SQR':
        if (a < 0) this.fail('illegal-argument', `SQRT[${a}]`)
        return Math.sqrt(a)
      case 'ABS':
        return Math.abs(a)
      case 'ROUND':
      case 'RND':
        return Math.sign(a) * Math.round(Math.abs(a))
      case 'FIX':
        return Math.trunc(a)
      case 'FUP':
        return Math.sign(a) * Math.ceil(Math.abs(a) - 1e-12)
      case 'LN':
        if (a <= 0) this.fail('illegal-argument', `LN[${a}]`)
        return Math.log(a)
      case 'EXP':
        return Math.exp(a)
      case 'POW':
        return Math.pow(a, nz(b))
      case 'BIN':
      case 'BCD':
        if (a < 0) this.fail('illegal-argument', `${f}[${a}]`)
        return a
      default:
        return this.fail('unknown-word', `${f} is not a macro function`)
    }
  }
}
