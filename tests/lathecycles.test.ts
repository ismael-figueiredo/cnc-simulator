import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createProfile, cutProfile, loadAlarmCatalog, loadControl, loadMachine, simulate, type Move, type Vec3 } from '../src/core'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
function load<T>(r: { ok: true; value: T } | { ok: false; issues: unknown[] }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r.value
}
const gl300 = load(loadMachine(read('configs/machines/romi-gl300.json')))
const fanucT = load(loadControl(read('configs/controls/fanuc-0i-tf-system-b.json')))
const alarms = load(loadAlarmCatalog(read('configs/alarms/fanuc-0i.json')))

/** A Fanuc 0i-TF program (system B, ";" at every block). */
const run = (blocks: string[]) =>
  simulate({
    text: ['%', 'O0001;', 'G21 G18 G40 G95;', 'T0101;', 'G97 S1000 M03;', ...blocks.map((b) => `${b};`), 'M30;', '%'].join('\n'),
    machine: gl300,
    control: fanucT,
    alarms
  })
const end = (m: Move | undefined) => (m?.points[m.points.length - 1] ?? [NaN, NaN, NaN]).map((v) => Math.round(v * 1000) / 1000) as unknown as Vec3
const codes = (r: ReturnType<typeof simulate>) => r.diagnostics.map((d) => d.alarm?.code ?? d.code)

// Shaft: Ø30 up to Z-20, Ø40 up to Z-40, face at Z0 (radius 15 and 20)
const SHAPE = ['N10 G00 X30.', 'G01 Z-20. F0.1', 'X40.', 'Z-40.', 'N20 X52.']

describe('G71 roughing and G70 finishing', () => {
  const r = run(['G00 X52. Z2.', 'G71 U2. R0.5', 'G71 P10 Q20 U0.4 W0.1 F0.3', ...SHAPE, 'G70 P10 Q20', 'G00 X100. Z50.'])

  it('runs with no alarm and does not run the shape program twice', () => {
    expect(codes(r).filter((c) => c.startsWith('PS'))).toEqual([])
    // "G01 Z-20. F0.1" moves the tool once: inside G70, not also right after G71
    const line = r.moves.find((m) => m.state.feed === 0.1)?.line
    expect(r.moves.filter((m) => m.line === line)).toHaveLength(1)
  })

  it('cuts 2 mm passes parallel to Z, stopping at the shape plus the allowance', () => {
    // Roughing passes start at the start point's Z (2) and run toward the chuck
    const passes = r.moves.filter((m) => m.kind === 'feed' && m.state.feed === 0.3 && m.points[0]?.[2] === 2)
    // Radius 26 − 2 = 24, 22, 20, 18, 16
    expect(passes.map((m) => end(m)[0])).toEqual([24, 22, 20, 18, 16])
    // Above the Ø40.4 shoulder they reach Z −39.9 (Z −40 + W 0.1), below it the Ø30.4 step at Z −19.9
    expect(passes.map((m) => end(m)[2])).toEqual([-39.9, -39.9, -19.9, -19.9, -19.9])
    // Then one pass along the shape at the allowance: Ø30.4 from Z 2.1 (Z 2 + W) to the step
    const along = r.moves.find((m) => m.kind === 'feed' && m.state.feed === 0.3 && m.points[0]?.[2] === 2.1)
    expect(along && [end(along)[0], end(along)[2]]).toEqual([15.2, -19.9])
  })

  it('leaves the finishing allowance after roughing, and G70 takes it off', () => {
    const roughEnd = r.moves.findIndex((m) => m.state.feed === 0.1)
    const after = (k: number) => {
      const p = createProfile({ shape: 'cylinder', diameter: 52, length: 60 }, [0, 0, 0])
      for (const m of r.moves.slice(0, k)) cutProfile(p, m)
      return (z: number) => p.radii[Math.round(-z / p.cell)] ?? NaN
    }
    const rough = after(roughEnd)
    // The profile keeps radii as 32-bit floats
    expect(rough(-10)).toBeCloseTo(15.2, 4) // Ø30 + 0.4
    expect(rough(-30)).toBeCloseTo(20.2, 4)
    const done = after(r.moves.length)
    expect(done(-10)).toBeCloseTo(15, 4)
    expect(done(-30)).toBeCloseTo(20, 4)
  })

  it('returns to the start point after each cycle', () => {
    // All roughing moves belong to the G71 block; its last one is the return to the start point
    const g71 = r.moves.find((m) => m.kind === 'feed' && m.state.feed === 0.3)?.line
    const lastRough = r.moves.filter((m) => m.line === g71).pop()
    expect(end(lastRough)).toEqual([26, 0, 2])
  })
})

describe('other lathe cycles', () => {
  it('G72 faces in Z steps', () => {
    const r = run(['G00 X52. Z2.', 'G72 W1.5 R0.5', 'G72 P10 Q20 U0.4 W0.1 F0.25', 'N10 G00 Z-6.', 'G01 X30. F0.1', 'Z0', 'N20 X0', 'G00 X100. Z50.'])
    expect(codes(r).filter((c) => c.startsWith('PS'))).toEqual([])
    const levels = new Set(r.moves.filter((m) => m.kind === 'feed' && m.state.feed === 0.25).map((m) => end(m)[2]))
    expect([...levels].some((z) => Math.abs(z - 0.5) < 1e-9)).toBe(true)
  })

  it('G73 follows the shape the given number of times', () => {
    const r = run(['G00 X60. Z5.', 'G73 U4. W2. R3', 'G73 P10 Q20 U0.4 W0.1 F0.25', ...SHAPE, 'G00 X100. Z50.'])
    expect(codes(r).filter((c) => c.startsWith('PS'))).toEqual([])
    const startsOfShape = r.moves.filter((m) => m.kind === 'rapid' && Math.abs(end(m)[0] - (15 + 0.2 + 4 * 1)) < 1e-6)
    expect(startsOfShape.length).toBe(1) // first pass: 4 mm relief + allowance
  })

  it('G77 is modal: each X repeats the cycle from the same start point', () => {
    const r = run(['G00 X52. Z2.', 'G77 X46. Z-30. F0.25', 'X42.', 'X38.', 'G00 X100.'])
    const cuts = r.moves.filter((m) => m.kind === 'feed' && end(m)[2] === -30 && m.points[0]?.[2] === 2)
    expect(cuts.map((m) => end(m)[0])).toEqual([23, 21, 19])
  })

  it('G79 faces', () => {
    const r = run(['G00 X52. Z2.', 'G79 X10. Z-2. F0.2', 'G00 X100.'])
    expect(r.moves.slice(-5, -1).map((m) => end(m))).toEqual([
      [26, 0, -2],
      [5, 0, -2],
      [5, 0, 2],
      [26, 0, 2]
    ])
  })

  it('G76 threads down to the full height, with the time set by the lead', () => {
    const r = run(['G00 X24. Z5.', 'G76 P020060 Q100 R0.05', 'G76 X17.835 Z-20. P1083 Q300 F1.5', 'G00 X100.'])
    expect(codes(r).filter((c) => c.startsWith('PS'))).toEqual([])
    const threads = r.moves.filter((m) => m.kind === 'feed')
    // Last two passes at the root, Ø17.835
    expect(end(threads[threads.length - 1])[0]).toBeCloseTo(17.835 / 2, 2)
    expect(end(threads[threads.length - 2])[0]).toBeCloseTo(17.835 / 2, 2)
    expect(threads.length).toBeGreaterThan(5)
    // 25 mm at 1.5 mm/rev and 1000 rpm: 1 s
    expect(threads[0]?.durationS).toBeCloseTo(1, 6)
  })

  it('G32 cuts a thread at the lead per revolution', () => {
    const r = run(['G00 X19. Z5.', 'G98', 'G32 Z-20. F1.5', 'G00 X100.'])
    const t = r.moves.find((m) => m.kind === 'feed')
    expect(t?.durationS).toBeCloseTo(1, 6)
  })

  it.each([
    ['no depth of cut (PS0062)', ['G00 X52. Z2.', 'G71 U0 R0.5', 'G71 P10 Q20 U0.4 W0.1 F0.3', ...SHAPE], 'PS0062'],
    ['a shape that turns back in Z (PS0064)', ['G00 X52. Z2.', 'G71 U2. R0.5', 'G71 P10 Q20 U0.4 W0.1 F0.3', 'N10 G00 X30.', 'G01 Z-20. F0.1', 'X40.', 'Z-10.', 'N20 X52.'], 'PS0064'],
    ['no G00/G01 in the first shape block (PS0065)', ['G00 X52. Z2.', 'G71 U2. R0.5', 'G71 P10 Q20 U0.4 W0.1 F0.3', 'N10 X30.', 'G01 Z-20. F0.1', 'N20 X52.'], 'PS0065']
  ])('stops on %s', (_name, blocks, code) => {
    expect(run(blocks).stoppedBy?.alarm?.code).toBe(code)
  })
})
