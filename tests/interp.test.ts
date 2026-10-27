import { describe, expect, it } from 'vitest'
import { Expr, parseProgram, type AlarmCatalog, type Move } from '../src/core'
import { machineAlarm } from '../src/core/interp/alarms'
import { arcThrough } from '../src/core/interp/arcs'
import { cutCorner, type Corner } from '../src/core/interp/corner'
import { toolOffsetSetting, workOffsetName, writeWorkOffset } from '../src/core/interp/dataSetting'
import type { DiagnosticCode } from '../src/core/interp/diagnostics'
import { findLoopEnd, findLoopStart, findSequence, isNcBlock, usesMacro } from '../src/core/interp/flow'
import { illegalProgramNumber, loadIssues, type FileFormat } from '../src/core/interp/loadChecks'
import { isIgnoredWrite, isReadOnly, isValidVariable, positionVariable } from '../src/core/interp/variables'
import { createWordReader, type WordOptions } from '../src/core/interp/words'

class Failed extends Error {
  constructor(readonly code: DiagnosticCode) {
    super(code)
  }
}
const fail = (code: DiagnosticCode): never => {
  throw new Failed(code)
}

describe('word reader', () => {
  const reader = (opts: Partial<WordOptions> = {}) => createWordReader(new Expr({ get: (n) => (n === 1 ? 7 : null) }), fail, { integerDecimal: 'alarm', maxDigits: 8, ...opts })
  const words = (s: string, opts?: Partial<WordOptions>) => reader(opts).parseWords(s)
  const failure = (s: string, opts?: Partial<WordOptions>) => {
    try {
      words(s, opts)
      return null
    } catch (e) {
      return e instanceof Failed ? e.code : null
    }
  }

  it('reads addresses, signs, decimal points, variables and spindle numbers', () => {
    expect(words('G01X-12.5Z#1S2=1200,R2')).toEqual([
      { addr: 'G', value: 1, literal: true, dot: false },
      { addr: 'X', value: -12.5, literal: true, dot: true },
      { addr: 'Z', value: 7, literal: false, dot: false },
      { addr: 'S', value: 1200, literal: true, dot: false, spindle: 2 },
      { addr: ',R', value: 2, literal: false, dot: false }
    ])
  })

  it('applies the address format checks', () => {
    expect(failure('X')).toBe('no-data-after-address')
    expect(failure('XY1')).toBe('no-data-after-address')
    expect(failure('M-3')).toBe('illegal-negative-sign')
    expect(failure('X--1')).toBe('illegal-negative-sign')
    expect(failure('X1.2.3')).toBe('illegal-decimal-point')
    expect(failure('M3.5')).toBe('illegal-decimal-point')
    expect(failure('X123456789')).toBe('too-many-digits')
    expect(failure('X1$')).toBe('invalid-character')
    expect(failure('12X1')).toBe('address-not-found')
  })

  it('keeps the integer part of "M3.5" on controls that accept it', () => {
    expect(words('M3.5', { integerDecimal: 'ignore' })).toEqual([{ addr: 'M', value: 3, literal: true, dot: false }])
  })
})

describe('macro variables', () => {
  it('knows the valid, read-only and ignored numbers', () => {
    expect([0, 1, 33, 100, 199, 500, 999, 1000].every(isValidVariable)).toBe(true)
    expect([34, 99, 200, 499].some(isValidVariable)).toBe(false)
    expect([4001, 5021, 3011].every(isReadOnly)).toBe(true)
    expect(isReadOnly(3000)).toBe(false)
    expect([3001, 3004, 3901].every(isIgnoredWrite)).toBe(true)
    expect(isIgnoredWrite(3006)).toBe(false)
  })

  it('maps #5001… to the frame and the machine axis', () => {
    expect(positionVariable(5001)).toEqual({ frame: 'work', axisIndex: 0 })
    expect(positionVariable(5023)).toEqual({ frame: 'machine', axisIndex: 2 })
    expect(positionVariable(5042)).toEqual({ frame: 'current', axisIndex: 1 })
    expect(positionVariable(5061)).toBeNull()
  })
})

describe('program flow', () => {
  const { blocks } = parseProgram('O1;\nN10 #1=0;\nWHILE[#1LT3]DO1;\nG0X1;\nEND1;\nGOTO10;\nM30;', 'parentheses')

  it('finds sequence numbers and the two ends of a loop', () => {
    expect(findSequence(blocks, 10)).toBe(1)
    expect(findSequence(blocks, 20)).toBe(-1)
    expect(findLoopEnd(blocks, 2, '1')).toBe(4)
    expect(findLoopStart(blocks, 4, '1')).toBe(2)
    expect(findLoopEnd(blocks, 2, '2')).toBe(-1)
  })

  it('tells NC blocks from macro statements', () => {
    expect(blocks.map((b) => isNcBlock(b))).toEqual([false, false, false, true, false, false, true])
    expect(usesMacro('G0X#1')).toBe(true)
    expect(usesMacro('G0X1')).toBe(false)
  })
})

describe('alarms', () => {
  const catalog = { id: 'c', prefix: 'PS', digits: 4, map: { 'feed-undefined': 11, 'macro-alarm': 3000 }, alarms: { '11': 'NO FEEDRATE COMMANDED' }, macroAlarmBase: 3000 } as unknown as AlarmCatalog

  it('formats the control alarm, and macro alarms as base + n with the comment', () => {
    expect(machineAlarm(catalog, 'feed-undefined')).toEqual({ code: 'PS0011', message: 'NO FEEDRATE COMMANDED', stops: true })
    expect(machineAlarm(catalog, 'macro-alarm', { num: 5, comment: 'PART MISSING' })).toEqual({ code: 'PS3005', message: 'PART MISSING', stops: true })
    expect(machineAlarm(catalog, 'overtravel')).toBeUndefined()
    expect(machineAlarm(null, 'feed-undefined')).toBeUndefined()
  })
})

describe('arcs', () => {
  it('finds the center from R on either side, and from center offsets', () => {
    const ccw = arcThrough(10, 0, 0, 10, false, { r: 10 })
    expect(ccw.ok && [ccw.arc.cu, ccw.arc.cv].map((v) => Math.round(v * 1e9) / 1e9)).toEqual([0, 0])
    const long = arcThrough(10, 0, 0, 10, false, { r: -10 })
    expect(long.ok && Math.round(long.arc.sweep * 1e9) / 1e9).toBe(Math.round(1.5 * Math.PI * 1e9) / 1e9)
    const ij = arcThrough(10, 0, -10, 0, true, { iu: -10, iv: 0 })
    expect(ij.ok && ij.arc.sweep).toBeCloseTo(Math.PI, 12)
  })

  it('makes a full circle from center offsets alone', () => {
    const r = arcThrough(10, 0, 10, 0, false, { iu: -10, iv: 0 })
    expect(r.ok && r.arc.sweep).toBeCloseTo(2 * Math.PI, 12)
  })

  it('returns the failing check', () => {
    expect(arcThrough(0, 0, 0, 0, false, { r: 5 })).toEqual({ ok: false, code: 'arc-start-equals-end' })
    expect(arcThrough(0, 0, 20, 0, false, { r: 5 })).toMatchObject({ ok: false, code: 'arc-radius-too-small' })
    expect(arcThrough(0, 0, 10, 0, false, { iu: 0, iv: 0 })).toEqual({ ok: false, code: 'arc-center-missing' })
  })
})

describe('corners', () => {
  const line = (p0: [number, number, number], p1: [number, number, number]): Move =>
    ({ kind: 'feed', line: 0, points: [p0, p1], durationS: 10, toolRadius: 0, element: { type: 'line', p0: [p0[0], p0[1]], p1: [p1[0], p1[1]] } }) as unknown as Move
  const corner = (kind: 'C' | 'R', size: number, move: Move, perpendicular = false): Corner => ({ kind, size, move, perpendicular })

  it('chamfers a right angle: both lines shortened by C, times scaled with length', () => {
    const prev = line([0, 0, 0], [10, 0, 0])
    const next = line([10, 0, 0], [10, 10, 0])
    const r = cutCorner(corner('C', 2, prev), next)
    expect(r.kind).toBe('cut')
    if (r.kind !== 'cut') return
    expect(r.prev.points).toEqual([[0, 0, 0], [8, 0, 0]])
    expect(r.next.points).toEqual([[10, 2, 0], [10, 10, 0]])
    expect(r.prev.durationS).toBeCloseTo(8, 9)
    expect(r.corner.points).toEqual([[8, 0, 0], [10, 2, 0]])
  })

  it('rounds with a tangent arc of radius R', () => {
    const r = cutCorner(corner('R', 2, line([0, 0, 0], [10, 0, 0])), line([10, 0, 0], [10, 10, 0]))
    expect(r.kind === 'cut' && r.corner.element).toMatchObject({ type: 'arc', radius: 2, cw: false, center: [8, 2] })
  })

  it('reports what cannot be cut', () => {
    expect(cutCorner(corner('C', 2, line([0, 0, 0], [10, 0, 0])), line([10, 0, 0], [20, 0, 0])).kind).toBe('straight')
    expect(cutCorner(corner('C', 20, line([0, 0, 0], [10, 0, 0])), line([10, 0, 0], [10, 10, 0]))).toMatchObject({ kind: 'error', code: 'corner-too-large' })
    expect(cutCorner(corner('C', 1, line([0, 0, 0], [10, 0, 0]), true), line([10, 0, 0], [20, 5, 0]))).toMatchObject({ kind: 'error', code: 'corner-taper' })
    const arc = { ...line([10, 0, 0], [10, 10, 0]), element: { type: 'arc' } } as unknown as Move
    expect(cutCorner(corner('R', 1, line([0, 0, 0], [10, 0, 0])), arc).kind).toBe('not-simulated')
  })
})

describe('G10 data setting', () => {
  const none = () => ({})

  it('writes machining center length and radius offsets, incremental in G91', () => {
    expect(toolOffsetSetting(none, 10, 5, { R: 120.5 }, { lathe: false, absolute: true })).toEqual({ n: 5, entry: { length: 120.5 } })
    expect(toolOffsetSetting(() => ({ radius: 4 }), 12, 5, { R: 0.1 }, { lathe: false, absolute: false })).toEqual({ n: 5, entry: { radius: 4.1 } })
    expect(toolOffsetSetting(none, 2, 1, { X: 1 }, { lathe: false, absolute: true })).toBeNull()
  })

  it('writes lathe wear (P n) and geometry (P 10000+n), U W C incremental', () => {
    expect(toolOffsetSetting(() => ({ xWear: 0.25 }), undefined, 3, { U: 0.5, Z: -0.05 }, { lathe: true, absolute: true })).toEqual({ n: 3, entry: { xWear: 0.75, zWear: -0.05 } })
    expect(toolOffsetSetting(none, undefined, 10003, { X: -200, R: 0.8, Q: 3 }, { lathe: true, absolute: true })).toEqual({ n: 3, entry: { x: -200, nose: 0.8, tip: 3 } })
  })

  it('names and writes work offsets', () => {
    expect(workOffsetName(2, 1)).toBe('G54')
    expect(workOffsetName(2, 6)).toBe('G59')
    expect(workOffsetName(20, 3)).toBe('G54.1 P3')
    expect(workOffsetName(2, 0)).toBeNull()
    expect(writeWorkOffset({ X: 100, Z: -300 }, { X: 5, W: -1 }, false, new Map([['W', 'Z']]))).toEqual({ X: 105, Z: -301 })
  })
})

describe('load checks', () => {
  const format: FileFormat = { startPercent: true, endPercent: true, eob: 'semicolon', missingEob: 'alarm', programNumber: 'required' }

  it('lists what the control checks when the file comes in', () => {
    const { layout, blocks } = parseProgram('G0 X0\n(OPEN\nM30;', 'parentheses')
    expect(loadIssues(layout, blocks, format).map((i) => [i.line, i.severity, i.code])).toEqual([
      [0, 'alarm', 'file-start-percent-missing'],
      [2, 'alarm', 'file-end-percent-missing'],
      [0, 'alarm', 'eob-missing'],
      [1, 'alarm', 'eob-missing'],
      [1, 'warning', 'unclosed-comment'],
      [0, 'warning', 'program-number-missing']
    ])
    const ok = parseProgram('%\nO1;\nM30;\n%', 'parentheses')
    expect(loadIssues(ok.layout, ok.blocks, format)).toEqual([])
  })

  it('finds a program number out of range', () => {
    expect(illegalProgramNumber(parseProgram('O0;\nM30;', 'parentheses').blocks, 9999)?.programNumber).toBe(0)
    expect(illegalProgramNumber(parseProgram('O10000;', 'parentheses').blocks, 9999)?.programNumber).toBe(10000)
    expect(illegalProgramNumber(parseProgram('O1;', 'parentheses').blocks, 9999)).toBeUndefined()
  })
})
