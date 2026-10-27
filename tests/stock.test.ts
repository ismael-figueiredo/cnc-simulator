import { describe, expect, it } from 'vitest'
import { DEFAULT_STOCK, isLathe, isLatheControl, machineKind, stockSize, workZero } from '../src/core'
import { controlConfig, machineConfig } from './helpers/configs'

describe('machine kind', () => {
  it('tells lathes from machining centers, by machine and by control', () => {
    expect(isLathe(machineConfig('romi-gl300'))).toBe(true)
    expect(machineKind(machineConfig('haas-vf2'))).toBe('mill')
    expect(isLathe(undefined)).toBe(false)
    expect(isLatheControl(controlConfig('fanuc-0i-tf-system-b'))).toBe(true)
    expect(isLatheControl(controlConfig('fanuc-0i-mf'))).toBe(false)
  })
})

describe('stock', () => {
  it('fills the sizes the stock leaves out', () => {
    expect(stockSize({ shape: 'block', x: 120 })).toEqual({ ...DEFAULT_STOCK, x: 120 })
    expect(stockSize({ shape: 'cylinder', diameter: 40, length: 90 })).toMatchObject({ diameter: 40, length: 90 })
  })

  it("puts a work offset's zero in the G54 drawing frame, on the spindle axis on lathes", () => {
    const offsets = { G54: { X: 100, Y: 50, Z: -300 }, G55: { X: 300, Y: 50, Z: -310 } }
    expect(workZero(offsets, 'G55', false)).toEqual([200, 0, -10])
    expect(workZero(offsets, 'G55', true)).toEqual([0, 0, -10])
    expect(workZero(offsets, 'G54', false)).toEqual([0, 0, 0])
  })
})
