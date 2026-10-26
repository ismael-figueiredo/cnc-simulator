import { describe, expect, it } from 'vitest'
import { holesOf, simulate } from '../src/core'
import { controlConfig, machineConfig, toolConfig } from './helpers/configs'

const d600 = machineConfig('romi-d600')
const fanucM = controlConfig('fanuc-0i-mf-romi-d')
const bt40 = toolConfig('machining-center')
const run = (blocks: string[]) =>
  simulate({ text: ['%', 'O0001', 'G21 G17 G90 G40', ...blocks, 'G0 Z50.', 'M30', '%'].join('\n'), machine: d600, control: fanucM, tools: bt40 })

describe('holes of the drilling cycles', () => {
  it('one hole per position, at the drill radius and the cycle depth', () => {
    const r = run(['T4 M6', 'G90 G54 G0 X15. Y20. S2200 M3', 'G43 Z50. H4', 'G99 G81 Z-12. R2. F220.', 'X45.', 'G80'])
    expect(holesOf(r.moves).map((h) => [h.x, h.y, h.radius, h.bottom])).toEqual([
      [15, 20, 4.25, -12],
      [45, 20, 4.25, -12]
    ])
  })

  it('pecks at the same spot are one hole, finished by the deepest peck', () => {
    const r = run(['T4 M6', 'G90 G54 G0 X15. Y20. S2200 M3', 'G43 Z50. H4', 'G99 G83 Z-20. R2. Q5. F220.', 'G80'])
    const holes = holesOf(r.moves)
    expect(holes).toHaveLength(1)
    expect(holes[0]?.bottom).toBe(-20)
    expect(r.moves[holes[0]?.last ?? -1]?.points.at(-1)?.[2]).toBe(-20)
  })

  it('a plunge outside a cycle and a contour are not holes', () => {
    const r = run(['T2 M6', 'G90 G54 G0 X-20. Y-20. S6000 M3', 'G43 Z50. H2', 'G0 Z5.', 'G1 Z-8. F600.', 'G1 X60.'])
    expect(holesOf(r.moves)).toEqual([])
  })
})
