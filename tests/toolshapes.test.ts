import { describe, expect, it } from 'vitest'
import { holderDrawing, holderOutline, insertOutline, type Holder, type Tool } from '../src/core'

const thread: Tool = { number: 5, name: 'Thread', type: 'threading', diameter: 0.4, length: 100, side: 'external', hand: 'right', insert: 'T' }
const bt40er32: Holder = { id: 'bt40-er32', name: 'BT40 ER32', standard: 'BT40', profile: [[31.75, 0], [31.75, 27], [25, 27], [25, 60], [20, 60], [20, 75]] }

describe('insert outlines', () => {
  it('lays the thread insert down with its 60° point square to the axis', () => {
    const [tip, a, b] = insertOutline(thread)
    expect(tip).toEqual([0, 0])
    // Both flanks at 30° from the X axis, symmetric in Z
    expect(Math.atan2(Math.abs(a?.[1] ?? 0), a?.[0] ?? 0) * (180 / Math.PI)).toBeCloseTo(30, 6)
    expect(a?.[1]).toBeCloseTo(-(b?.[1] ?? 0), 9)
    // Internal threading mirrors it toward the axis from the bore
    expect(insertOutline({ ...thread, side: 'internal' })[1]?.[0]).toBeLessThan(0)
  })

  it('draws the WNMG trigon with three 80° corners', () => {
    const w = insertOutline({ ...thread, type: 'turning-insert', insert: 'W' })
    expect(w).toHaveLength(6)
    const angle = (k: number) => {
      const [p, q, r] = [w[(k + 5) % 6], w[k], w[(k + 1) % 6]].map((v) => v ?? [0, 0])
      const a = Math.atan2((p?.[1] ?? 0) - (q?.[1] ?? 0), (p?.[0] ?? 0) - (q?.[0] ?? 0))
      const b = Math.atan2((r?.[1] ?? 0) - (q?.[1] ?? 0), (r?.[0] ?? 0) - (q?.[0] ?? 0))
      const d = Math.abs(((a - b) * 180) / Math.PI) % 360
      return Math.round(d > 180 ? 360 - d : d)
    }
    expect([0, 1, 2, 3, 4, 5].map(angle)).toEqual([80, 160, 80, 160, 80, 160])
  })
})

describe('holder drawing', () => {
  it('adds the BT40 taper, pull stud and flange groove above the profile', () => {
    const plain = holderOutline(bt40er32, 40)
    const drawn = holderDrawing(bt40er32, 40)
    const top = plain[plain.length - 1]?.[1] ?? 0
    expect(top).toBe(115)
    // The 7:24 taper from Ø44.45 at the flange face, 65.4 long
    expect(drawn).toContainEqual([22.225, 115])
    const end = drawn.find(([, h]) => h === 115 + 65.4)
    expect(end?.[0]).toBeCloseTo(22.225 - (65.4 * 7) / 48, 6)
    // V-groove: narrower than the flange in the middle of it
    expect(drawn.some(([r, h]) => r < 31.75 && r > 25 && h > 88 && h < 115)).toBe(true)
    // ER nut chamfered at its lower edge, and the outline closes on the axis
    expect(drawn[0]?.[0]).toBeLessThan(20)
    expect(drawn[drawn.length - 1]?.[0]).toBe(0)
  })

  it('leaves holders without a known taper as their profile', () => {
    const vdi: Holder = { id: 'vdi', name: 'VDI', standard: 'VDI30', profile: [[20, 0], [20, 30]] }
    expect(holderDrawing(vdi, 50)).toEqual(holderOutline(vdi, 50))
  })
})
