import { describe, expect, it } from 'vitest'
import { Expr, MacroError, type MacroErrorKind, type Value } from '../src/core'

/** Evaluates a whole expression with the given variables (unset ones are null, like #0). */
function evaluate(text: string, vars: Record<number, Value> = {}, maxBrackets?: number): Value {
  const e = new Expr({ get: (n) => vars[n] ?? null }, maxBrackets).at(text, 0)
  const v = e.compare()
  if (e.pos !== text.length) throw new Error(`stopped at ${e.pos} of "${text}"`)
  return v
}

function failure(text: string, maxBrackets?: number): MacroErrorKind | null {
  try {
    evaluate(text, {}, maxBrackets)
    return null
  } catch (e) {
    return e instanceof MacroError ? e.kind : null
  }
}

describe('macro expressions', () => {
  it('applies the usual precedence: * / AND MOD before + - OR XOR', () => {
    expect(evaluate('1+2*3')).toBe(7)
    expect(evaluate('[1+2]*3')).toBe(9)
    expect(evaluate('10-4-3')).toBe(3)
    expect(evaluate('7MOD4+1')).toBe(4)
    expect(evaluate('6AND3OR8')).toBe(10)
    expect(evaluate('5XOR1')).toBe(4)
    expect(evaluate('-2*-3')).toBe(6)
  })

  it('reads variables, also by computed number, and treats null as 0 in arithmetic', () => {
    expect(evaluate('#1+#2', { 1: 2, 2: 3 })).toBe(5)
    expect(evaluate('#[#1+1]', { 1: 4, 5: 9 })).toBe(9)
    expect(evaluate('#3')).toBeNull()
    expect(evaluate('#3+1')).toBe(1)
  })

  it('compares with a tolerance, and null equals only null', () => {
    expect(evaluate('[0.1+0.2]EQ0.3')).toBe(1)
    expect(evaluate('#1EQ0')).toBe(0)
    expect(evaluate('#1EQ#2')).toBe(1)
    expect(evaluate('#1NE0')).toBe(1)
    expect(evaluate('2GT1')).toBe(1)
    expect(evaluate('2GE2')).toBe(1)
    expect(evaluate('2LT1')).toBe(0)
    expect(evaluate('1LE1')).toBe(1)
  })

  it('evaluates the functions in degrees', () => {
    expect(evaluate('SIN[30]')).toBeCloseTo(0.5, 12)
    expect(evaluate('COS[60]')).toBeCloseTo(0.5, 12)
    expect(evaluate('TAN[45]')).toBeCloseTo(1, 12)
    expect(evaluate('ASIN[1]')).toBeCloseTo(90, 12)
    expect(evaluate('ACOS[0]')).toBeCloseTo(90, 12)
    expect(evaluate('ATAN[1]')).toBeCloseTo(45, 12)
    expect(evaluate('SQRT[16]')).toBe(4)
    expect(evaluate('ABS[-3]')).toBe(3)
    expect(evaluate('LN[1]')).toBe(0)
    expect(evaluate('EXP[0]')).toBe(1)
    expect(evaluate('POW[2,10]')).toBe(1024)
  })

  it('takes the two-argument ATAN in both forms, from 0 to 360°', () => {
    expect(evaluate('ATAN[1]/[1]')).toBeCloseTo(45, 12)
    expect(evaluate('ATAN[-1,1]')).toBeCloseTo(315, 12)
    expect(evaluate('ATAN[1,-1]')).toBeCloseTo(135, 12)
  })

  it('rounds away from zero: ROUND to nearest, FIX toward zero, FUP up in magnitude', () => {
    expect(evaluate('ROUND[2.5]')).toBe(3)
    expect(evaluate('ROUND[-2.5]')).toBe(-3)
    expect(evaluate('FIX[-2.7]')).toBe(-2)
    expect(evaluate('FUP[2.1]')).toBe(3)
    expect(evaluate('FUP[-2.1]')).toBe(-3)
    expect(evaluate('FUP[2]')).toBe(2)
  })

  it('reports each error with the kind that maps to a control alarm', () => {
    expect(failure('1/0')).toBe('division-by-zero')
    expect(failure('1MOD0')).toBe('division-by-zero')
    expect(failure('TAN[90]')).toBe('division-by-zero')
    expect(failure('SQRT[-1]')).toBe('illegal-argument')
    expect(failure('ASIN[2]')).toBe('illegal-argument')
    expect(failure('LN[0]')).toBe('illegal-argument')
    expect(failure('FOO[1]')).toBe('unknown-word')
    expect(failure('SIN1')).toBe('unknown-word')
    expect(failure('[1+2')).toBe('expression')
    expect(failure('*2')).toBe('expression')
  })

  it('limits bracket nesting (Fanuc: 5 levels)', () => {
    expect(evaluate('[[[[[1]]]]]')).toBe(1)
    expect(failure('[[[[[[1]]]]]]')).toBe('bracket-nesting')
    expect(failure('[[1]]', 1)).toBe('bracket-nesting')
  })

  it('stops at the end of the expression, so the interpreter can read what follows', () => {
    const e = new Expr({ get: () => null }).at('#1=2+3GOTO10', 3)
    expect(e.compare()).toBe(5)
    expect(e.pos).toBe(6)
  })
})
