import { describe, expect, it } from 'vitest'
import { simulate, type Control, type Machine, type Move, type WorkOffsets } from '../src/core'
import { controlConfig, machineConfig } from './helpers/configs'

const vf2: Machine = machineConfig('haas-vf2')
const haas: Control = controlConfig('haas-ngc-mill')

const program = (blocks: string[]) => ['%', 'O01000', 'G21 G17 G90 G40 G80', ...blocks, 'M30', '%'].join('\n')
const run = (blocks: string[], workOffsets?: WorkOffsets) => simulate({ text: program(blocks), machine: vf2, control: haas, workOffsets })
const end = (m: Move | undefined) => m?.points[m.points.length - 1]
const errors = (r: ReturnType<typeof simulate>) => r.diagnostics.filter((d) => d.severity === 'alarm').map((d) => d.code)

const TABLE: WorkOffsets = { G54: { X: -400, Y: -200, Z: -400 }, 'G54.1 P5': { X: -300, Y: -200, Z: -400 } }

describe('Haas NGC', () => {
  it('G154 P n is the same offset as G54.1 P n', () => {
    const r = run(['G154 P5 G0 X0 Y0'], TABLE)
    expect(errors(r)).toEqual([])
    expect(r.moves[0]?.state.workOffset).toBe('G54.1 P5')
    // 100 mm to the right of G54
    expect(end(r.moves[0])?.slice(0, 2)).toEqual([100, 0])
  })

  it('G110–G129 are G154 P1–P20', () => {
    const r = run(['G114 G0 X0 Y0', 'G129 G0 X0 Y0'], TABLE)
    expect(r.moves[0]?.state.workOffset).toBe('G54.1 P5')
    expect(r.moves[1]?.state.workOffset).toBe('G54.1 P20')
  })

  it('G10 L20 G154 P n writes the offset without selecting it', () => {
    const r = run(['G54 G0 X0 Y0', 'G10 L20 G90 G154 P7 X-350. Y-200. Z-400.', 'G0 X10.', 'G154 P7 G0 X0'], TABLE)
    expect(r.moves[1]?.state.workOffset).toBe('G54')
    expect(r.moves[2]?.state.workOffset).toBe('G54.1 P7')
    expect(end(r.moves[2])?.[0]).toBe(50)
  })

  it('M97 P n calls the local subprogram at N n and returns after M99', () => {
    const r = simulate({
      text: ['%', 'O01001', 'G21 G90 G54 G0 X0. Y0.', 'M97 P100 L2', 'G0 X50.', 'M30', 'N100 G91 G0 X10.', 'G90', 'M99', '%'].join('\n'),
      machine: vf2,
      control: haas
    })
    expect(errors(r)).toEqual([])
    const xs = r.moves.map((m) => end(m)?.[0])
    // The first block is already at X0: no move
    expect(xs).toEqual([10, 20, 50])
  })

  it('M97 to a missing N stops with an alarm', () => {
    const r = run(['M97 P900'])
    expect(errors(r)).toContain('goto-target-missing')
  })
})
