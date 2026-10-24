import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadAlarmCatalog, loadControl, loadMachine, simulate, type AlarmCatalog, type Control, type Machine } from '../src/core'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
function load<T>(r: { ok: true; value: T } | { ok: false; issues: unknown[] }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r.value
}
const machine = (id: string): Machine => load(loadMachine(read(`configs/machines/${id}.json`)))
const control = (id: string): Control => load(loadControl(read(`configs/controls/${id}.json`)))
const catalog = (id: string): AlarmCatalog => load(loadAlarmCatalog(read(`configs/alarms/${id}.json`)))

/** A valid file: "%", O number, ";" on every block, M30, "%". */
const file = (blocks: string[]) => ['%', 'O0001', ...blocks, 'M30', '%'].map((l) => (l === '%' ? l : `${l};`)).join('\n')
const marked = (text: string) => text.split('\n').findIndex((l) => l.includes('(*)'))
const alarms = (r: ReturnType<typeof simulate>) => r.diagnostics.filter((d) => d.severity === 'alarm').map((d) => d.alarm?.code ?? d.code)

describe('Romi GL 300 (no C axis, no live tool)', () => {
  const run = (text: string) => simulate({ text, machine: machine('romi-gl300'), control: control('fanuc-0i-tf-system-b'), alarms: catalog('fanuc-0i') })

  it('runs a turning program', () => {
    const r = run(file(['G21 G90 G95', 'T0101', 'G97 S1500 M3', 'G0 X52 Z2', 'G1 Z-30 F0.2', 'G0 X60 Z5']))
    expect(alarms(r)).toEqual([])
    expect(r.finished).toBe(true)
  })

  it.each([
    ['G12.1 polar interpolation', ['G12.1 (*)'], 'PS0010'],
    ['C axis word', ['G0 X50 C90 (*)'], 'PS0009'],
    ['live tool speed S2=', ['G97 S2=1500 M3 (*)'], 'PS0010']
  ])('refuses %s', (_name, blocks, code) => {
    const text = file(blocks)
    const r = run(text)
    expect(r.stoppedBy?.alarm?.code).toBe(code)
    expect(r.stoppedBy?.line).toBe(marked(text))
  })
})

describe('Romi D line (Fanuc 0i-MF)', () => {
  const run = (id: string, text: string) => simulate({ text, machine: machine(id), control: control('fanuc-0i-mf-romi-d'), alarms: catalog('fanuc-0i') })
  // Structure from the programming flowchart in the Romi D manuals
  const program = file([
    'G17 G21 G90 G94',
    'G53 G0 Z0 H0 M5',
    'T1 M06 (BROCA 8MM)',
    'G54.1 P1 S2000 M3',
    'G0 X20 Y20',
    'G43 Z50 H1',
    'G99 G81 X20 Y20 Z-10 R2 F150',
    'X40',
    'G80',
    'G53 G0 Z0 H0 M5'
  ])

  it.each(['romi-d600', 'romi-d1000', 'romi-d1250'])('%s runs the manual flowchart program', (id) => {
    const r = run(id, program)
    expect(alarms(r)).toEqual([])
    expect(r.finished).toBe(true)
    expect(r.moves.filter((m) => m.kind === 'feed')).toHaveLength(2)
  })

  it('warns that G68 coordinate rotation is not drawn, without moving to its center', () => {
    const r = run('romi-d600', file(['G17 G21 G90 G94', 'G0 X0 Y0 Z5', 'G68 X10 Y10 R45', 'G69']))
    expect(r.diagnostics.map((d) => d.code)).toContain('function-not-simulated')
    expect(r.moves.some((m) => m.line === 4)).toBe(false)
  })

  it('PS0007 decimal point on M', () => {
    const text = file(['M3.5 (*)'])
    expect(run('romi-d600', text).stoppedBy?.alarm?.code).toBe('PS0007')
  })
})

describe('Mitsubishi M800/M80', () => {
  const lathe = (text: string, list = 'mitsubishi-m80-lathe-list3') =>
    simulate({ text, machine: machine('mitsubishi-lathe'), control: control(list), alarms: catalog('mitsubishi-m800') })
  const mc = (text: string) => simulate({ text, machine: machine('mitsubishi-mc'), control: control('mitsubishi-m80-mc'), alarms: catalog('mitsubishi-m800') })

  it.each([
    ['P34 G code not in list 3', ['G05.5 X10 (*)'], 'P34'],
    ['P62 cutting without F', ['G0 X50. Z2.', 'G1 Z-5. (*)'], 'P62'],
    ['P157 G41 to G42 without G40', ['G1 X50. Z2. F0.2 S500 M3', 'G41 G1 X40.', 'G42 G1 X30. (*)'], 'P157'],
    ['P232 program not found', ['M98 P9999 (*)'], 'P232'],
    ['P283 division by zero', ['#1=0', '#2=1/#1 (*)'], 'P283'],
    ['P294 DO without END', ['WHILE [1 EQ 1] DO1 (*)'], 'P294']
  ])('%s', (_name, blocks, code) => {
    const text = file(blocks)
    const r = lathe(text)
    expect(r.stoppedBy?.alarm?.code).toBe(code)
    expect(r.stoppedBy?.line).toBe(marked(text))
  })

  it('#3000 raises P277 with the program message', () => {
    const r = lathe(file(['#3000=5 (CHECK TOOL)']))
    expect(r.stoppedBy?.alarm).toMatchObject({ code: 'P277', message: 'CHECK TOOL' })
  })

  it('accepts a decimal point on M and S (drops the decimals) and reads X10 as 0.010 mm', () => {
    const r = lathe(file(['G0 X10 Z2.', 'M3.5 S500.5', 'G0 Z5.']))
    expect(alarms(r)).toEqual([])
    const end = r.moves[r.moves.length - 1]?.position
    expect(end?.X).toBeCloseTo(0.01, 9)
    expect(r.moves[r.moves.length - 1]?.state.spindleSpeed).toBe(500)
  })

  it('list 2 uses G98/G99 for feed and G90 as a turning cycle', () => {
    const r = lathe(file(['G98 G0 X50. Z2.', 'G1 Z-10. F200', 'G90 X40. Z-20. F0.2']), 'mitsubishi-m80-lathe-list2')
    expect(alarms(r)).toEqual([])
    expect(r.moves.find((m) => m.kind === 'feed')?.state.feedPerMinute).toBe(true)
    // G90 from X50 Z-10: in to Ø40, cut to Z-20, out to Ø50, back to the start point
    const ends = r.moves.slice(-4).map((m) => m.points[m.points.length - 1]?.map((v) => Math.round(v * 1000) / 1000))
    expect(ends).toEqual([[20, 0, -10], [20, 0, -20], [25, 0, -20], [25, 0, -10]])
    expect(r.moves.slice(-4).map((m) => m.kind)).toEqual(['rapid', 'feed', 'feed', 'rapid'])
  })

  it('P155 canned cycle with cutter compensation active on the machining center', () => {
    const text = file(['G17 G21 G90 G94', 'T1 M06 (FRESA 10MM)', 'S2000 M3', 'G0 X-10. Y0 Z5.', 'G41 G1 X0 Y0 F200', 'G81 X10. Y10. Z-5. R2. (*)'])
    const r = mc(text)
    expect(r.stoppedBy?.alarm?.code).toBe('P155')
    expect(r.stoppedBy?.line).toBe(marked(text))
  })

  it('G12 circle cutting is reported as not drawn', () => {
    const r = mc(file(['G17 G21 G90 G94', 'T1 M06 (FRESA 10MM)', 'S2000 M3', 'G0 X0 Y0 Z5.', 'G12 I20. D1 F300']))
    expect(r.diagnostics.map((d) => d.code)).toContain('function-not-simulated')
  })
})
