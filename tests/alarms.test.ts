import { describe, expect, it } from 'vitest'
import { simulate, type AlarmCatalog, type Control, type Machine } from '../src/core'
import { alarmConfig, controlConfig, machineConfig } from './helpers/configs'

const romi: Machine = machineConfig('romi-gl250-m')
const lathe: Control = controlConfig('fanuc-0i-tf-system-b')
const mill: Machine = machineConfig('mill-3axis')
const millControl: Control = controlConfig('fanuc-0i-mf')
const fanuc: AlarmCatalog = alarmConfig('fanuc-0i')

/** Wraps blocks in a valid file: "%", O number, ";" on every block, M30, "%". */
const file = (blocks: string[], { end = 'M30' } = {}) => ['%', 'O0001', ...blocks, ...(end ? [end] : []), '%'].map((l) => (l === '%' ? l : `${l};`)).join('\n')

const POLAR = ['G21 G90 G94', 'T0101 (FRESA D.12mm)', 'G97 S2=1500 M3', 'M19', 'G28 C0', 'G0 X70 Z0', 'G1 Z-5 F1000', 'G12.1']

const runLathe = (text: string) => simulate({ text, control: lathe, machine: romi, alarms: fanuc })
const runMill = (text: string) => simulate({ text, control: millControl, machine: mill, alarms: fanuc })
/** File line (0-based) of the first block containing the marker "(*)". */
const marked = (text: string) => text.split('\n').findIndex((l) => l.includes('(*)'))

describe('Fanuc program alarms stop the program at the block, like the machine', () => {
  const cases: [string, string[], string][] = [
    ['PS0001 invalid character', ['G0 X10 @ (*)'], 'PS0001'],
    ['PS0003 too many digits', ['G0 X123456789 (*)'], 'PS0003'],
    ['PS0004 number without address', ['5 X10 (*)'], 'PS0004'],
    ['PS0005 address without data', ['G0 X (*)'], 'PS0005'],
    ['PS0006 minus on T', ['T-101 (*)'], 'PS0006'],
    ['PS0006 two signs', ['G0 X--5 (*)'], 'PS0006'],
    ['PS0007 two decimal points', ['G0 X1.2.3 (*)'], 'PS0007'],
    ['PS0007 decimal point on M', ['M3.5 (*)'], 'PS0007'],
    ['PS0009 Y axis on a lathe without Y', ['G0 X50 Y10 (*)'], 'PS0009'],
    ['PS0010 G code not defined', ['G05 X10 (*)'], 'PS0010'],
    ['PS0011 cutting without F', ['G0 X50 Z2', 'G1 Z-5 (*)'], 'PS0011'],
    ['PS0020 arc end off the circle', ['G0 X40 Z0', 'G1 X40 Z0 F0.1 S500 M3', 'G2 X60 Z-10 I5 K-10 (*)'], 'PS0020'],
    ['PS0021 C axis in a G18 arc', ['G0 X40 Z0', 'G1 X40 Z0 F0.1', 'G2 X60 Z-10 R10 C5 (*)'], 'PS0021'],
    ['PS0022 arc without R or I/K', ['G0 X40 Z0', 'G1 X40 Z0 F0.1', 'G2 X60 Z-10 (*)'], 'PS0022'],
    ['PS0023 negative R on a lathe', ['G0 X40 Z0', 'G1 X40 Z0 F0.1', 'G2 X60 Z-10 R-10 (*)'], 'PS0023'],
    ['PS0034 G41 started on an arc', [...POLAR, 'G41 G2 X60 C10 R20 (*)'], 'PS0034'],
    ['PS0146 plane change inside polar interpolation', [...POLAR, 'G41 G1 X35 C0 F500', 'G1 X35 C10', 'G17 (*)'], 'PS0146'],
    ['PS0041 blocks without movement in compensation', [...POLAR, 'G41 G1 X35 C0 F500', 'G1 X35 C10', 'G4 P100', 'M8 (*)'], 'PS0041'],
    ['PS0061 G70 without Q', ['N10 G0 X40 Z0', 'N20 G1 Z-10 F0.1', 'G70 P10 (*)'], 'PS0061'],
    ['PS0063 G70 to a missing sequence', ['N10 G0 X40 Z0', 'G70 P10 Q99 (*)'], 'PS0063'],
    ['PS0076 M98 without P', ['M98 (*)'], 'PS0076'],
    ['PS0078 M98 to a missing program', ['M98 P9999 (*)'], 'PS0078'],
    ['PS0112 division by zero', ['#1=0', '#2=10/#1 (*)'], 'PS0112'],
    ['PS0112 TAN of 90 degrees', ['#2=TAN[90] (*)'], 'PS0112'],
    ['PS0114 IF without GOTO or THEN', ['IF [1 EQ 1] #1=2 (*)'], 'PS0114'],
    ['PS0115 variable that does not exist', ['#40=1 (*)'], 'PS0115'],
    ['PS0116 writing a position variable', ['#5001=1 (*)'], 'PS0116'],
    ['PS0118 more than 5 bracket levels', ['#1=[[[[[[1]]]]]] (*)'], 'PS0118'],
    ['PS0119 square root of a negative number', ['#1=SQRT[-4] (*)'], 'PS0119'],
    ['PS0124 WHILE without END', ['#1=0', 'WHILE [#1 LT 3] DO1 (*)', '#1=#1+1'], 'PS0124'],
    ['PS0126 loop number out of 1-3', ['#1=0', 'WHILE [#1 LT 3] DO4 (*)', '#1=#1+1', 'END4'], 'PS0126'],
    ['PS0127 NC and macro in the same block', ['#1=1 G1 X10 (*)'], 'PS0127'],
    ['PS0128 GOTO to a missing block', ['GOTO 99 (*)'], 'PS0128'],
    ['PS0146 G00 in polar interpolation', [...POLAR, 'G0 X60 C0 (*)'], 'PS0146'],
    ['PS0199 unknown macro function', ['#1=FOO[1] (*)'], 'PS0199'],
    ['PS3007 #3000 alarm from the program', ['#3000=7 (*) (TOO FEW TEETH)'], 'PS3007']
  ]

  it.each(cases)('%s', (_name, blocks, code) => {
    const text = file(blocks)
    const r = runLathe(text)
    expect(r.stoppedBy?.alarm?.code).toBe(code)
    expect(r.stoppedBy?.line).toBe(marked(text))
    expect(r.finished).toBe(false)
    // nothing after the alarm block was executed
    expect(r.moves.every((m) => m.line <= marked(text))).toBe(true)
  })

  it('PS0077 subprograms nested more than 4 levels', () => {
    const subs = [1, 2, 3, 4, 5].flatMap((n) => [`O100${n}`, n < 5 ? `M98 P100${n + 1}` : 'G0 X10', 'M99'])
    const text = ['%', 'O0001;', 'M98 P1001;', 'M30;', ...subs.map((l) => `${l};`), '%'].join('\n')
    expect(runLathe(text).stoppedBy?.alarm?.code).toBe('PS0077')
  })

  it('PS5010 end of record reached without M30', () => {
    const text = file(['G0 X50 Z2'], { end: '' })
    const r = runLathe(text)
    expect(r.stoppedBy?.alarm).toMatchObject({ code: 'PS5010', message: 'END OF RECORD' })
    expect(r.stoppedBy?.line).toBe(text.split('\n').length - 1)
  })

  it('PS0045 G83 on the mill without Q', () => {
    const text = file(['G21 G17 G90 G94', 'T1 M06 (FRESA 10MM)', 'S3000 M3', 'G0 X0 Y0 Z5', 'G83 X10 Y10 Z-5 R2 F100 (*)'])
    const r = runMill(text)
    expect(r.stoppedBy?.alarm?.code).toBe('PS0045')
    expect(r.stoppedBy?.line).toBe(marked(text))
  })

  it('PS0037 plane change with cutter compensation active', () => {
    const text = file(['G21 G17 G90 G94', 'T1 M06 (FRESA 10MM)', 'S3000 M3', 'G0 X-10 Y0 Z5', 'G1 Z-2 F200', 'G41 G1 X0 Y0', 'G1 X10', 'G18 (*)'])
    const r = runMill(text)
    expect(r.stoppedBy?.alarm?.code).toBe('PS0037')
    expect(r.stoppedBy?.line).toBe(marked(text))
  })

  it('PS0041 tool bigger than a concave arc cuts the path where the machine stops', () => {
    // Ø20 cutter (R10) on the inside of an R8 arc
    const text = file([
      'G21 G17 G90 G94',
      'T1 M06 (FRESA 20MM)',
      'S3000 M3',
      'G0 X-20 Y0 Z5',
      'G1 Z-2 F200',
      'G41 G1 X0 Y0',
      'G1 X30',
      'G3 X40 Y10 R15',
      'G3 X50 Y20 R8 (*)',
      'G1 X80',
      'G40 G1 X90 Y30',
      'G0 Z50'
    ])
    const r = runMill(text)
    expect(r.stoppedBy?.alarm?.code).toBe('PS0041')
    expect(r.stoppedBy?.line).toBe(marked(text))
    expect(r.moves.some((m) => m.line > marked(text))).toBe(false)
  })
})

describe('file format (Fanuc 0i-TF on the Romi)', () => {
  it('accepts a correct file without alarms', () => {
    const r = runLathe(file(['G0 X50 Z2']))
    expect(r.diagnostics.filter((d) => d.severity === 'alarm')).toEqual([])
    expect(r.finished).toBe(true)
  })

  it('reports missing start and end "%" and missing EOB, and still runs the program', () => {
    const text = ['O0001;', 'G0 X50 Z2', 'M30;'].join('\n')
    const r = runLathe(text)
    expect(r.diagnostics.map((d) => `L${d.line + 1} ${d.code}`)).toEqual(
      expect.arrayContaining(['L1 file-start-percent-missing', 'L3 file-end-percent-missing', 'L2 eob-missing'])
    )
    expect(r.finished).toBe(true)
  })

  it('ignores what comes after the closing "%"', () => {
    const text = `${file(['G0 X50 Z2'])}\nG05 X1;`
    expect(runLathe(text).diagnostics.filter((d) => d.severity === 'alarm')).toEqual([])
  })

  it('PS0074 program number out of range', () => {
    const text = ['%', 'O12345;', 'M30;', '%'].join('\n')
    expect(runLathe(text).stoppedBy?.alarm?.code).toBe('PS0074')
  })

  it('without an alarm catalog the same checks are plain diagnostics', () => {
    const r = simulate({ text: file(['G05 X10']), control: lathe, machine: romi })
    expect(r.stoppedBy).toBeUndefined()
    expect(r.diagnostics.some((d) => d.code === 'unknown-g-code' && !d.alarm)).toBe(true)
  })
})
