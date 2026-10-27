import { describe, expect, it } from 'vitest'
import { createBarModel, cutBar, hasLiveCuts, simulate, type BarModel, type Move, type Stock, type ToolLibrary } from '../src/core'
import { controlConfig, machineConfig, read, toolConfig } from './helpers/configs'

const romi = machineConfig('romi-gl250-m')
const fanucT = controlConfig('fanuc-0i-tf-system-b')
const library = toolConfig('sample-library')

const run = (blocks: string[], tools: ToolLibrary | null = null) =>
  simulate({ text: ['%', ...blocks.map((b) => `${b};`), '%'].join('\n'), control: fanucT, machine: romi, tools }).moves
const cutAll = (b: BarModel, moves: readonly Move[], radial = new Set<number>()) => {
  for (const m of moves) cutBar(b, m, radial.has(m.state.tool))
  return b
}
/** Outer radius at an angle (degrees) and Z. */
const radiusAt = (b: BarModel, deg: number, z: number) => b.radii[Math.round((b.face - z) / b.cell) * b.nTheta + Math.round(((deg % 360) / 360) * b.nTheta)] ?? NaN
/** Face height at X/Y. */
const faceAt = (b: BarModel, x: number, y: number) => {
  const h = b.faceMap
  return h.heights[Math.round((y - h.y0) / h.cell) * h.nx + Math.round((x - h.x0) / h.cell)] ?? NaN
}
const bar: Stock = { shape: 'cylinder', diameter: 60, length: 40 }

describe('bar cut with live tools', () => {
  it('turns the radius all around and faces to the center', () => {
    const b = cutAll(createBarModel(bar, [0, 0, 0]), run(['O0001', 'G21 G18 G95', 'T0101', 'G97 S1000 M3', 'G0 X64 Z-1', 'G1 X-1 F0.2', 'G0 X50 Z2', 'G1 Z-20', 'G0 X64']))
    for (const deg of [0, 90, 200, 358]) expect(radiusAt(b, deg, -10)).toBeCloseTo(25, 5)
    expect(radiusAt(b, 45, -30)).toBe(30)
    // Faced 1 mm: nothing left in front of Z-1
    expect(radiusAt(b, 0, -0.5)).toBe(0)
  })

  it('leaves a flat where a radial end mill plunges at C90', () => {
    const radialTools: ToolLibrary = {
      id: 'r',
      name: 'r',
      units: 'mm',
      holders: [],
      tools: [{ number: 3, name: 'Ø10 radial', type: 'flat-endmill', diameter: 10, length: 40, mount: 'radial' }]
    }
    const moves = run(['O0001', 'G21 G18 G94', 'T0303', 'M19', 'G0 C90', 'G97 S2=1000 M3', 'G0 X70 Z-20', 'G1 X50 F100', 'G0 X70', 'M5'], radialTools)
    expect(hasLiveCuts(moves)).toBe(true)
    const b = cutAll(createBarModel(bar, [0, 0, 0]), moves, new Set([3]))
    // The flat at radius 25 under the tool, the round bar elsewhere and outside the tool's width
    expect(radiusAt(b, 90, -20)).toBeCloseTo(25, 3)
    expect(radiusAt(b, 94, -20)).toBeCloseTo(25 / Math.cos((4 * Math.PI) / 180), 3)
    expect(radiusAt(b, 270, -20)).toBe(30)
    expect(radiusAt(b, 90, -30)).toBe(30)
  })

  it('mills a slot along Z with the radial end mill at C0', () => {
    const radialTools: ToolLibrary = { id: 'r', name: 'r', units: 'mm', holders: [], tools: [{ number: 3, name: 'Ø8 radial', type: 'flat-endmill', diameter: 8, length: 40, mount: 'radial' }] }
    const moves = run(['O0001', 'G21 G18 G94', 'T0303', 'M19', 'G0 C0', 'G97 S2=1000 M3', 'G0 X70 Z-10', 'G1 X54 F100', 'G1 Z-30', 'G0 X70', 'M5'], radialTools)
    const b = cutAll(createBarModel(bar, [0, 0, 0]), moves, new Set([3]))
    for (const z of [-12, -20, -28]) expect(radiusAt(b, 0, z)).toBeCloseTo(27, 3)
    expect(radiusAt(b, 0, -36)).toBe(30)
    expect(radiusAt(b, 180, -20)).toBe(30)
  })

  it('cuts the O1500 sprocket teeth in the face map, and the turned bar has no live cuts', () => {
    const moves = simulate({ text: read('examples/O1500_COROA_ANSI40.nc'), control: fanucT, machine: romi, tools: library }).moves
    const b = cutAll(createBarModel({ shape: 'cylinder', diameter: 67.37, length: 30 }, [0, 0, 0]), moves)
    // Around the gear just inside its outside diameter: 15 gaps cut 7.7 deep, 15 teeth left at the face
    const r = 67.37 / 2 - 1
    let gaps = 0
    let previous = faceAt(b, r, 0) < -1
    for (let k = 1; k <= 720; k++) {
      const a = (k / 720) * 2 * Math.PI
      const cut = faceAt(b, r * Math.cos(a), r * Math.sin(a)) < -1
      if (cut && !previous) gaps++
      previous = cut
    }
    expect(gaps).toBe(15)
    expect(Math.min(...b.faceMap.heights)).toBeCloseTo(-7.7, 1)
    // The middle of the gear is untouched
    expect(faceAt(b, 0, 0)).toBe(0)
    expect(hasLiveCuts(run(['O0001', 'G21 G18 G95', 'T0101', 'G97 S1000 M3', 'G0 X50 Z2', 'G1 Z-20 F0.2']))).toBe(false)
  })
})
