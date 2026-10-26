// The part as it comes out: the stock placed as the 3D view places it, cut by every move, measured.
// Covers work offsets (changed in the table, G54/G55 in the same program, G10) and tool lengths.
import { describe, expect, it } from 'vitest'
import {
  createHeightfield,
  createProfile,
  cutHeightfield,
  cutProfile,
  defaultToolOffsets,
  keepStockOnTable,
  simulate,
  workShift,
  type Stock,
  type ToolOffsets,
  type WorkOffsets
} from '../src/core'
import { controlConfig, machineConfig, toolConfig } from './helpers/configs'

const d600 = machineConfig('romi-d600')
const fanucM = controlConfig('fanuc-0i-mf-romi-d')
const bt40 = toolConfig('machining-center')
const gl300 = machineConfig('romi-gl300')
const fanucT = controlConfig('fanuc-0i-tf-system-b')
const turning = toolConfig('lathe-turning')

const VISE: WorkOffsets = { G54: { X: 200, Y: 200, Z: -400 } }
/** Block 60 × 40 × 20 in the vise, its top face on G54 Z0. */
const BLOCK: Stock = { shape: 'block', x: 60, y: 40, z: 20, offset: { X: -5, Y: -5, Z: 0 } }

/** Mills the block and gives the cut depth (below the stock top) at program X, Y in the stock's frame. */
function mill(blocks: string[], workOffsets: WorkOffsets, stock: Stock = BLOCK, toolOffsets?: ToolOffsets) {
  const text = ['%', 'O0001', 'G21 G17 G90 G40 G49', 'T2 M6', ...blocks, 'G0 Z50.', 'M30', '%'].join('\n')
  const r = simulate({ text, machine: d600, control: fanucM, tools: bt40, toolOffsets, workOffsets })
  const s = workShift(workOffsets, stock.workOffset ?? 'G54')
  const h = createHeightfield(stock, [s.X, s.Y, s.Z])
  for (const m of r.moves) cutHeightfield(h, m, false)
  const depth = (x: number, y: number) => {
    const i = Math.round((x + s.X - h.x0) / h.cell)
    const j = Math.round((y + s.Y - h.y0) / h.cell)
    return Math.round((h.top - (h.heights[j * h.nx + i] ?? h.top)) * 1000) / 1000
  }
  return { result: r, depth }
}

const SLOT = ['G90 G54 G0 X10. Y15. S6000 M3', 'G43 Z50. H2', 'G0 Z5.', 'G1 Z-2. F600.', 'G1 X40.']

describe('work offsets on the machined part', () => {
  it('cuts 2 mm into the stock with G54 where the part is', () => {
    expect(mill(SLOT, VISE).depth(25, 15)).toBe(2)
  })

  it('a zero moved up in the table leaves the stock on the table: the tool cuts the air', () => {
    const moved: WorkOffsets = { G54: { X: 200, Y: 200, Z: -395 } }
    const stock = keepStockOnTable(BLOCK, VISE, moved)
    expect(stock.offset?.Z).toBe(-5)
    expect(mill(SLOT, moved, stock).depth(25, 15)).toBe(0)
  })

  it('a zero moved down cuts deeper, by as much', () => {
    const moved: WorkOffsets = { G54: { X: 200, Y: 200, Z: -401 } }
    expect(mill(SLOT, moved, keepStockOnTable(BLOCK, VISE, moved)).depth(25, 15)).toBe(3)
  })

  it('a zero moved in X shifts the slot on the part', () => {
    const moved: WorkOffsets = { G54: { X: 210, Y: 200, Z: -400 } }
    const part = mill(SLOT, moved, keepStockOnTable(BLOCK, VISE, moved))
    // The Ø12 slot covered X4–X46 of the old zero; now X14–X56 of it. depth() measures from the new
    // zero, 10 mm to the right: old X8 is new X-2 (no longer cut), old X52 is new X42 (now cut)
    expect(part.depth(-2, 15)).toBe(0)
    expect(part.depth(42, 15)).toBe(2)
  })

  it('a value set for the first time defines the zero, it does not move the stock', () => {
    expect(keepStockOnTable(BLOCK, {}, VISE)).toBe(BLOCK)
  })

  it('G54 and G55 in the same program: each block cuts on its own zero', () => {
    // G55 is the same vise 1 mm lower: the second slot is 1 mm deeper on the same part
    const table: WorkOffsets = { ...VISE, G55: { X: 200, Y: 200, Z: -401 } }
    const part = mill(
      ['G90 G54 G0 X10. Y10. S6000 M3', 'G43 Z50. H2', 'G0 Z5.', 'G1 Z-2. F600.', 'G1 X20.', 'G0 Z5.', 'G55 G0 X30. Y25.', 'G1 Z-2.', 'G1 X45.'],
      table
    )
    expect(part.depth(15, 10)).toBe(2)
    expect(part.depth(40, 25)).toBe(3)
  })

  it('G10 L2 in the program moves the zero for the blocks after it', () => {
    const part = mill([...SLOT, 'G0 Z5.', 'G10 L2 P1 Z-401.', 'G54 G0 X10. Y30.', 'G1 Z-2.', 'G1 X40.'], VISE)
    expect(part.depth(25, 15)).toBe(2)
    expect(part.depth(25, 30)).toBe(3)
  })
})

describe('tool lengths on the machined part', () => {
  const gauge = defaultToolOffsets(bt40, false)['2']?.length ?? 0

  it('with H equal to the tool, the depth is the programmed one', () => {
    expect(mill(SLOT, VISE, BLOCK, { '2': { length: gauge } }).depth(25, 15)).toBe(2)
  })

  it('an H 1 mm shorter than the tool takes the tip 1 mm deeper', () => {
    expect(mill(SLOT, VISE, BLOCK, { '2': { length: gauge - 1 } }).depth(25, 15)).toBe(3)
  })

  it('an H 3 mm longer than the tool leaves it 1 mm above the stock', () => {
    expect(mill(SLOT, VISE, BLOCK, { '2': { length: gauge + 3 } }).depth(25, 15)).toBe(0)
  })

  it('wear adds to the length', () => {
    expect(mill(SLOT, VISE, BLOCK, { '2': { length: gauge, lengthWear: -0.5 } }).depth(25, 15)).toBe(2.5)
  })
})

describe('lathe work offsets on the turned part', () => {
  const CHUCK: WorkOffsets = { G54: { X: 0, Z: -500 } }
  /** Bar Ø50 × 80, face 1 mm in front of Z0. */
  const BAR: Stock = { shape: 'cylinder', diameter: 50, length: 80, offset: { Z: 1 } }
  const program = ['%', 'O0001', 'G21 G18 G40 G95', 'T0101', 'G97 S1500 M03', 'G00 X42. Z2.', 'G01 Z-20. F0.25', 'G00 X100. Z50.', 'M30', '%'].join('\n')

  /** Radius of the turned bar `fromFace` mm behind the stock's own face. */
  function radiusFromFace(workOffsets: WorkOffsets, stock: Stock, fromFace: number) {
    const r = simulate({ text: program, machine: gl300, control: fanucT, tools: turning, workOffsets })
    const s = workShift(workOffsets, 'G54')
    const p = createProfile(stock, [0, 0, s.Z])
    for (const m of r.moves) cutProfile(p, m)
    return p.radii[Math.round(fromFace / p.cell)]
  }

  it('turns Ø42 from the face to 21 mm deep with the zero on the face', () => {
    expect(radiusFromFace(CHUCK, BAR, 20.5)).toBeCloseTo(21, 3)
    expect(radiusFromFace(CHUCK, BAR, 22)).toBe(25)
  })

  it('a Z zero 2 mm further out turns 2 mm less of the bar clamped in the chuck', () => {
    const moved: WorkOffsets = { G54: { X: 0, Z: -498 } }
    const stock = keepStockOnTable(BAR, CHUCK, moved)
    expect(radiusFromFace(moved, stock, 18.5)).toBeCloseTo(21, 3)
    expect(radiusFromFace(moved, stock, 20.5)).toBe(25)
  })
})
