import { describe, expect, it } from 'vitest'
import { tableLayout, type Machine, type Stock } from '../src/core'

const mill: Machine = {
  id: 'm',
  name: 'Mill',
  type: 'machining-center',
  kinematics: 'mill-xyz',
  axes: [
    { name: 'X', type: 'linear', min: 0, max: 600, rapid: 30000 },
    { name: 'Y', type: 'linear', min: 0, max: 500, rapid: 30000 },
    { name: 'Z', type: 'linear', min: -500, max: 0, rapid: 30000 }
  ],
  spindles: [{ id: 'S1', name: 'S', type: 'spindle', maxRpm: 10000 }],
  toolChangePosition: { X: 0, Y: 0, Z: 0 },
  defaultControl: 'c',
  table: { length: 840, width: 500, slots: 5, slotWidth: 18, slotPitch: 80, top: -560, center: { X: 300, Y: 250 } }
}
const block: Stock = { shape: 'block', x: 100, y: 60, z: 30 }

describe('machining center table', () => {
  it('sits where the work offset puts the stock on the machine, a vise filling the gap', () => {
    const t = tableLayout(mill, block, { G54: { X: 200, Y: 200, Z: -420 } }, [0, 0, 0])
    expect(t).toMatchObject({ top: -140, center: [100, 50], length: 840, slots: [-160, -80, 0, 80, 160], slotWidth: 18 })
    // Stock bottom at -30, table 110 below it: a vise on the table, its jaws gripping 12 mm of the stock
    expect(t?.vise).toEqual({ x: [0, 100], y: [0, 60], base: -140, seat: -30, jawTop: -18 })
  })

  it('goes right under the stock without work offsets', () => {
    const t = tableLayout(mill, block, {}, [0, 0, 0])
    expect(t?.center).toEqual([50, 30])
    expect(t?.top).toBe(-120)
    expect(t?.vise?.base).toBe(-120)
  })

  it('clamps wide stock and stock resting on the table without a vise', () => {
    expect(tableLayout(mill, { ...block, y: 300 }, {}, [0, 0, 0])).toMatchObject({ top: -30, vise: null })
    // G54 Z puts the stock bottom 10 mm over the table: it sits on it
    expect(tableLayout(mill, block, { G54: { X: 200, Y: 200, Z: -520 } }, [0, 0, 0])).toMatchObject({ top: -30, vise: null })
  })

  it('centers on the stock when the offsets would put it off the table', () => {
    expect(tableLayout(mill, block, { G54: { X: 900, Y: 200, Z: -420 } }, [0, 0, 0])?.center).toEqual([50, 30])
  })

  it('sizes a table from the travels without one in the machine file', () => {
    const t = tableLayout({ ...mill, table: undefined }, block, {}, [0, 0, 0])
    expect(t).toMatchObject({ length: 750, width: 450, slots: [-150, -75, 0, 75, 150] })
  })

  it('has no table on a lathe or for a bar', () => {
    expect(tableLayout(mill, { shape: 'cylinder', diameter: 50, length: 60 }, {}, [0, 0, 0])).toBeNull()
  })
})
