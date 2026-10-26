import { describe, expect, it } from 'vitest'
import { findTailstockCollisions, simulate, tailstockGeometry, type Stock } from '../src/core'
import { controlConfig, machineConfig } from './helpers/configs'

const gl300 = machineConfig('romi-gl300')
const control = controlConfig('fanuc-0i-tf-system-b')
const run = (blocks: string[]) =>
  simulate({ text: ['O0001;', 'G21 G95;', 'T0101;', 'G97 S1000 M3;', ...blocks.map((b) => `${b};`), 'M30;'].join('\n'), machine: gl300, control }).moves
const bar: Stock = { shape: 'cylinder', diameter: 50, length: 120 }

describe('tailstock', () => {
  it('is in the Romi GL 300 file', () => {
    expect(gl300.tailstock?.quillDiameter).toBeGreaterThan(0)
  })

  it('follows M27 (advance) and M26 (retract) in the program', () => {
    const moves = run(['G0 X60 Z5', 'M27', 'G0 X55', 'M26', 'G0 X60'])
    expect(moves.map((m) => m.state.tailstock)).toEqual([false, true, false])
  })

  it('puts the center on the bar face', () => {
    expect(tailstockGeometry(bar, [0, 0, 1], { quillDiameter: 80 })).toMatchObject({ tip: 1, retract: 80, quillRadius: 40 })
  })

  it('flags facing to the axis with the center against the part, not turning along the bar', () => {
    const facing = run(['G0 X54 Z0', 'M27', 'G1 X-1 F0.15', 'G0 Z2'])
    // The cut to the axis, and backing off along it: the center is still there
    expect(findTailstockCollisions(facing, bar, [0, 0, 0], gl300.tailstock).map((c) => [c.part, c.z])).toEqual([['tailstock', 0], ['tailstock', 2]])
    const turning = run(['G0 X46 Z2', 'M27', 'G1 Z-60 F0.2', 'G0 X52 Z2'])
    expect(findTailstockCollisions(turning, bar, [0, 0, 0], gl300.tailstock)).toEqual([])
    // Retracted, facing is free again
    expect(findTailstockCollisions(run(['G0 X54 Z0', 'G1 X-1 F0.15']), bar, [0, 0, 0], gl300.tailstock)).toEqual([])
  })
})
