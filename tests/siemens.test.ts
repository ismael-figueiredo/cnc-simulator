import { describe, expect, it } from 'vitest'
import { holesOf, simulate, type Move } from '../src/core'
import { readSiemensBlock, siemensExpression } from '../src/core/interp/siemens'
import { controlConfig, machineConfig, toolConfig } from './helpers/configs'

const lathe = { machine: machineConfig('siemens-840d-lathe'), control: controlConfig('siemens-840d-lathe'), tools: toolConfig('lathe-turning') }
const mill = { machine: machineConfig('siemens-840d-mill'), control: controlConfig('siemens-840d-mill'), tools: toolConfig('machining-center') }
const turn = (lines: string[]) => simulate({ text: lines.join('\n'), ...lathe })
const millRun = (lines: string[]) => simulate({ text: lines.join('\n'), ...mill, workOffsets: { G54: { X: 300, Y: 200, Z: -400 } } })
const codes = (r: ReturnType<typeof simulate>) => r.diagnostics.map((d) => d.code)
const end = (m: Move | undefined) => (m?.points.at(-1) ?? []).map((v) => Math.round(v * 1000) / 1000)

describe('Siemens blocks', () => {
  it('turn expressions and words into the interpreter form', () => {
    expect(siemensExpression('R1*2+SIN(30)')).toBe('#501*2+SIN[30]')
    expect(siemensExpression('(R10>=R3) AND (R2<>0)')).toBe('[#510GE#503]AND[#502NE0]')
    expect(siemensExpression('ATAN2(R1,R2)+POT(R3)')).toBe('ATAN[#501,#502]+POW[#503,2]')
    expect(readSiemensBlock('G1 X=R1+2 Z-5 CR=10 F0.2').nc).toBe('G1X[#501+2]Z-5R[10]F0.2')
    expect(readSiemensBlock('G1 X40 RND=2 CHF=1 CHR=0.5').nc).toBe('G1X40,R[2],F[1],C[0.5]')
    expect(readSiemensBlock('G0 X=IC(5) Z=AC(10)').nc).toBe('G0U[5]Z[10]')
    expect(readSiemensBlock('G4 F2').nc).toBe('G4X2')
    expect(readSiemensBlock('G33 Z-30 K1.5').nc).toBe('G33Z-30F1.5')
  })

  it('separate assignments, labels, jumps, calls, cycles and the tool', () => {
    expect(readSiemensBlock('R1=10 R2=R1*2').assigns).toEqual(['#501=10', '#502=#501*2'])
    expect(readSiemensBlock('LOOP: IF R1 > 5 GOTOB LOOP')).toMatchObject({ label: 'LOOP', jump: { target: 'LOOP', condition: '#501GT5' } })
    expect(readSiemensBlock('L230 P2').call).toEqual({ program: 230, repeat: 2 })
    expect(readSiemensBlock('MCALL CYCLE81 (10, 0, 2, -20, )')).toMatchObject({ modalCall: 'set', cycle: { name: 'CYCLE81', args: ['10', '0', '2', '-20', null] } })
    expect(readSiemensBlock('MCALL').modalCall).toBe('cancel')
    expect(readSiemensBlock('CYCLE95("A:B", 2, , , , , , , 9)').cycle?.args[0]).toBe('"A:B"')
    expect(readSiemensBlock('T2 D1 M6')).toMatchObject({ tool: 2, edge: 1, nc: 'M6' })
  })

  it('report frames and other words as not simulated, and do not move with a frame', () => {
    expect(readSiemensBlock('TRANS X10 Y5')).toMatchObject({ nc: '', notSimulated: ['TRANS'] })
    expect(readSiemensBlock('G1 X20 CIP').notSimulated).toEqual(['CIP'])
  })
})

describe('Siemens lathe programs', () => {
  it('loop with R parameters, IF and GOTOB', () => {
    const r = turn(['T1 D1', 'G97 S1000 M3', 'R1=50', 'PASS: R1=R1-4', 'G0 X=R1 Z2', 'G1 Z-10 F0.2', 'G0 X60 Z2', 'IF R1>40 GOTOB PASS', 'M30'])
    expect(r.finished).toBe(true)
    expect(r.moves.filter((m) => m.kind === 'feed').map((m) => m.points[0]?.[0] ?? 0)).toEqual([23, 21, 19])
  })

  it('jump to a label that is not there is an alarm', () => {
    expect(codes(turn(['GOTOF NOWHERE', 'M30']))).toContain('goto-target-missing')
  })

  it('T with D selects tool and offset; D defaults to 1', () => {
    const r = turn(['T2', 'G97 S800 M3', 'G0 X50 Z2', 'T3 D2', 'G0 X60', 'M30'])
    expect(r.moves.map((m) => [m.state.tool, m.state.offset])).toEqual([
      [2, 1],
      [3, 2]
    ])
  })

  it('chamfers with CHF by its own length, rounds with RND', () => {
    const r = turn(['T1 D1', 'G97 S800 M3 G95', 'G0 X20 Z2', 'G1 Z-10 F0.1 CHF=2', 'G1 X40', 'M30'])
    const chamfer = r.moves.find((m) => m.kind === 'feed' && m.points.length === 2 && Math.abs((m.points[0]?.[2] ?? 0) - (m.points[1]?.[2] ?? 0)) > 0.1 && Math.abs((m.points[0]?.[0] ?? 0) - (m.points[1]?.[0] ?? 0)) > 0.1)
    const [a, b] = chamfer?.points ?? []
    expect(Math.hypot((b?.[0] ?? 0) - (a?.[0] ?? 0), (b?.[2] ?? 0) - (a?.[2] ?? 0))).toBeCloseTo(2, 6)
  })

  it('CYCLE95 roughs along a contour between labels, then finishes it', () => {
    const r = turn([
      'T1 D1',
      'G97 S1000 M3 G95',
      'G0 X64 Z2',
      'CYCLE95("C1:C2", 2, 0, 0.2, , 0.3, , 0.1, 9)',
      'G0 X100 Z50',
      'M30',
      'C1: G1 X30 Z0',
      'G1 Z-20',
      'C2: G1 X60'
    ])
    expect(codes(r)).toEqual([])
    const rough = r.moves.filter((m) => m.kind === 'feed' && m.state.feed === 0.3 && Math.abs((m.points[0]?.[2] ?? 0) - (m.points.at(-1)?.[2] ?? 0)) > 1)
    expect(Math.min(...rough.map((m) => m.points[0]?.[0] ?? 0))).toBeCloseTo(15.2, 6)
    const finish = r.moves.filter((m) => m.state.feed === 0.1)
    expect(finish.map(end)).toContainEqual([15, 0, -20])
  })

  it('threads with G33 at the lead K, per revolution', () => {
    const r = turn(['T5 D1', 'G97 S600 M3', 'G0 X29 Z4', 'G33 Z-20 K1.5', 'G0 X34', 'M30'])
    const thread = r.moves.find((m) => m.thread)
    expect(thread?.state.feed).toBe(1.5)
    expect(end(thread)).toEqual([14.5, 0, -20])
  })
})

describe('Siemens machining center programs', () => {
  it('D activates the length of the tool in the spindle', () => {
    const r = millRun(['T2 M6', 'D1', 'G54 G0 X0 Y0 Z50 S1000 M3', 'G1 Z-2 F200', 'M30'])
    expect(r.diagnostics.filter((d) => d.severity !== 'info')).toEqual([])
    expect(r.moves.at(-1)?.state.tool).toBe(2)
    expect(r.moves.at(-1)?.position.Z).toBe(-2)
  })

  it('MCALL repeats the drilling cycle at every position, until MCALL alone', () => {
    const r = millRun([
      'T4 M6',
      'D1',
      'G54 G0 X0 Y0 Z50 S2000 M3',
      'MCALL CYCLE81(10, 0, 2, -12, )',
      'X10 Y10',
      'X30',
      'MCALL',
      'X50',
      'M30'
    ])
    expect(holesOf(r.moves).map((h) => [h.x, h.y, h.bottom])).toEqual([
      [10, 10, -12],
      [30, 10, -12]
    ])
    expect(end(r.moves.at(-1))).toEqual([50, 10, 10])
  })

  it('CYCLE83 drills in steps that get shorter by DAM, clearing chips to the reference plane', () => {
    const r = millRun(['T4 M6', 'D1', 'G54 G0 X10 Y10 Z50 S2000 M3', 'CYCLE83(10, 0, 2, -20, , -6, , 2, , , 1, 1)', 'M30'])
    const depths = r.moves.filter((m) => m.kind === 'feed').map((m) => end(m)[2])
    expect(depths).toEqual([-6, -10, -12, -14, -16, -18, -20])
    expect(r.moves.filter((m) => m.kind === 'rapid' && end(m)[2] === 2).length).toBeGreaterThan(depths.length - 1)
  })

  it('calls a subprogram L n P m written after M30, back with M17', () => {
    const r = millRun(['T2 M6', 'D1', 'G54 G0 X0 Y0 Z50 S1000 M3', 'L10 P2', 'M30', 'L10: G91 G0 X10', 'G90', 'M17'])
    expect(r.finished).toBe(true)
    expect(end(r.moves.at(-1))[0]).toBe(20)
  })

  it('warns about cycles it does not draw', () => {
    expect(codes(millRun(['POCKET1(10, 0, 2, -5, , 40, 20, 5, 30, 20, 0, 100, 50, 3, 2, 0, 0, 0)', 'M30']))).toContain('cycle-not-simulated')
  })
})
