import { describe, expect, it } from 'vitest'
import { simulate, type Control, type Move, type Vec3 } from '../src/core'
import { alarmConfig, controlConfig, machineConfig, toolConfig } from './helpers/configs'

const mill = machineConfig('mill-3axis')
const fanucM = controlConfig('fanuc-0i-mf')
const gl300 = machineConfig('romi-gl300')
const fanucT = controlConfig('fanuc-0i-tf-system-b')
const alarms = alarmConfig('fanuc-0i')
const tools = toolConfig('machining-center')

const run = (blocks: string[], control: Control = fanucM, machine = mill) =>
  simulate({ text: ['%', 'O0001', ...blocks, 'M30', '%'].join('\n'), machine, control, alarms, tools })
const feeds = (r: ReturnType<typeof simulate>) => r.moves.filter((m) => m.kind === 'feed')
const ends = (m: Move | undefined): [Vec3, Vec3] => [m?.points[0] ?? [NaN, NaN, NaN], m?.points[m.points.length - 1] ?? [NaN, NaN, NaN]]
const round = (p: Vec3) => p.map((v) => Math.round(v * 1000) / 1000)
const square = ['G21 G17 G90', 'G0 X0 Y0 Z0', 'G1 X50 ,C5 F100', 'G1 Y50']

describe('chamfer and corner R', () => {
  it('chamfers between two lines with ,C', () => {
    const f = feeds(run(square))
    expect(f).toHaveLength(3)
    expect(ends(f[0]).map(round)).toEqual([[0, 0, 0], [45, 0, 0]])
    expect(ends(f[1]).map(round)).toEqual([[45, 0, 0], [50, 5, 0]])
    expect(ends(f[2]).map(round)).toEqual([[50, 5, 0], [50, 50, 0]])
    // The chamfer belongs to the block that programs it
    expect(f[1]?.line).toBe(f[0]?.line)
  })

  it('rounds with a tangent arc with ,R', () => {
    const f = feeds(run(['G21 G17 G90', 'G0 X0 Y0 Z0', 'G1 X50 ,R5 F100', 'G1 Y50']))
    const arc = f[1]
    expect(ends(arc).map(round)).toEqual([[45, 0, 0], [50, 5, 0]])
    for (const p of arc?.points ?? []) expect(Math.hypot(p[0] - 45, p[1] - 5)).toBeCloseTo(5, 6)
    expect(arc?.element).toMatchObject({ type: 'arc', radius: 5, cw: false })
  })

  it('works on any angle, not only 90°', () => {
    const f = feeds(run(['G21 G17 G90', 'G0 X0 Y0 Z0', 'G1 X50 ,R5 F100', 'G1 X100 Y50']))
    // 45° turn: the arc starts R·tan(22.5°) before the corner
    expect(ends(f[0])[1][0]).toBeCloseTo(50 - 5 * Math.tan(Math.PI / 8), 6)
  })

  it('keeps cutter compensation around the rounded corner', () => {
    // T2 is a Ø12 endmill: outside the R10 corner the tool center runs on R16
    const r = run(['G21 G17 G90', 'T2 M6', 'G0 X-20 Y-20 Z0', 'G41 D2 G1 X0 Y0 F100', 'G1 Y50 ,R10', 'G1 X50', 'G40 G1 X60 Y60'])
    const arc = feeds(r).find((m) => m.element?.type === 'arc')
    expect(arc?.toolCenter?.length).toBeGreaterThan(2)
    for (const p of arc?.toolCenter ?? []) expect(Math.hypot(p[0] - 10, p[1] - 40)).toBeCloseTo(16, 3)
    expect(r.diagnostics.filter((d) => d.severity === 'alarm')).toEqual([])
  })

  it.each([
    ['larger than a move (PS0055)', ['G1 X50 ,C60 F100', 'G1 Y50'], 'PS0055'],
    ['followed by a rapid (PS0052)', ['G1 X50 ,C5 F100', 'G0 Y50'], 'PS0052'],
    ['followed by a block without a move (PS0051)', ['G1 X50 ,C5 F100', 'M08', 'G1 Y50'], 'PS0051'],
    ['with both ,C and ,R (PS0053)', ['G1 X50 ,C5 ,R5 F100', 'G1 Y50'], 'PS0053'],
    ['at the end of the program (PS0051)', ['G1 X50 ,C5 F100'], 'PS0051']
  ])('stops %s', (_name, blocks, code) => {
    const r = run(['G21 G17 G90', 'G0 X0 Y0 Z0', ...blocks])
    expect(r.stoppedBy?.alarm?.code).toBe(code)
  })

  it('leaves a corner next to an arc sharp, with a warning', () => {
    const r = run(['G21 G17 G90', 'G0 X0 Y0 Z0', 'G1 X50 ,R5 F100', 'G3 X60 Y10 R10'])
    expect(r.diagnostics.map((d) => d.code)).toContain('direct-corner-not-simulated')
    expect(feeds(r)).toHaveLength(2)
  })

  describe('lathe, C and R without comma (option)', () => {
    const withOption: Control = { ...fanucT, dialect: { ...fanucT.dialect, cornerWithoutComma: true } }
    const lathe = (blocks: string[], control = withOption) =>
      run(['G21 G95', 'T0101', 'G97 S1000 M3', 'G0 X40 Z2', ...blocks].map((b) => `${b};`), control, gl300)

    it('chamfers a shoulder with C', () => {
      const r = lathe(['G1 Z-20 C2 F0.2', 'G1 X60'])
      const f = feeds(r)
      expect(r.stoppedBy).toBeUndefined()
      // Diameter 40 → radius 20; the chamfer runs from Z-18 to radius 22 (Ø44) at Z-20
      expect(round(ends(f[1])[0])).toEqual([20, 0, -18])
      expect(round(ends(f[2])[0])).toEqual([22, 0, -20])
    })

    it('refuses a taper after it (PS0054)', () => {
      expect(lathe(['G1 Z-20 C2 F0.2', 'G1 X60 Z-30']).stoppedBy?.alarm?.code).toBe('PS0054')
    })

    it('is the axis without the option (GL 300 has no C: PS0009)', () => {
      expect(lathe(['G1 Z-20 C2 F0.2', 'G1 X60'], fanucT).stoppedBy?.alarm?.code).toBe('PS0009')
    })
  })
})
