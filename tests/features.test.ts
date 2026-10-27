import { describe, expect, it } from 'vitest'
import { createHeightfield, heightfieldFeatures, holeFeatures, snapToFeatures, turnedFeatures, turnedOutline, type Heightfield, type Vec3 } from '../src/core'

const round = (p: readonly number[]) => p.map((v) => Math.round(v * 1000) / 1000)

describe('turned outline', () => {
  // Ø40 bar, 2 mm face chamfer, Ø30 for 20 mm, then the full Ø40: sampled every 0.1 mm from the face Z0
  const radii = Array.from({ length: 401 }, (_, i) => {
    const z = i * 0.1
    if (z < 2) return 13 + z
    if (z <= 20) return 15
    return 20
  })
  const outline = turnedOutline(radii, 0, 0.1)

  it('keeps only the corners: chamfer, shoulder, and the ends', () => {
    expect(outline.map((q) => [Math.round(q.z * 10) / 10, Math.round(q.r * 10) / 10])).toEqual([
      [0, 13],
      [-2, 15],
      [-20, 15],
      // The shoulder wall where the Ø30 ends, not one sample later
      [-20, 20],
      [-40, 20]
    ])
  })

  it('puts them on the side of the bar that was clicked, with the face center', () => {
    const f = turnedFeatures(outline, [0, 10, -5])
    expect(round(f.vertices[1] as Vec3)).toEqual([0, 15, -2])
    expect(f.centers).toEqual([[0, 0, 0]])
    expect(f.edges.length).toBe(outline.length)
  })
})

describe('milled surface', () => {
  /** A 40 × 40 block, top Z0, 10 mm deep, with a 10 × 10 pocket 5 mm deep at X10..20 Y10..20. */
  function pocket(): Heightfield {
    const h = createHeightfield({ shape: 'block', x: 40, y: 40, z: 10 }, [0, 0, 0])
    for (let j = 0; j < h.ny; j++)
      for (let i = 0; i < h.nx; i++) {
        const x = h.x0 + i * h.cell
        const y = h.y0 + j * h.cell
        if (x >= 10 && x <= 20 && y >= 10 && y <= 20) h.heights[j * h.nx + i] = -5
      }
    return h
  }

  it('finds the pocket corner, top and bottom, and its walls', () => {
    const h = pocket()
    const f = heightfieldFeatures(h, [10, 10, 0], 2)
    const top = snapToFeatures([10.4, 9.7, 0.2], f, 1)
    expect(top.kind).toBe('vertex')
    expect(round(top.point).map((v) => Math.round(v))).toEqual([10, 10, 0])
    const bottom = snapToFeatures([10.3, 10.3, -4.8], f, 1)
    expect(bottom.kind).toBe('vertex')
    expect(Math.round(bottom.point[2])).toBe(-5)
    const wall = snapToFeatures([15, 9.8, 0.1], heightfieldFeatures(h, [15, 9.8, 0.1], 2), 1)
    expect(wall.kind).toBe('edge')
    expect(Math.abs(wall.point[1] - 10)).toBeLessThan(h.cell)
  })

  it("finds the block's own corners and edges", () => {
    const f = heightfieldFeatures(pocket(), [0, 0, 0], 2)
    const corner = snapToFeatures([0.3, 0.4, -0.2], f, 1)
    expect(corner.kind).toBe('vertex')
    expect(round(corner.point)).toEqual([0, 0, 0])
  })

  it('does not make corners out of the steps of a curved wall', () => {
    const h = createHeightfield({ shape: 'block', x: 40, y: 40, z: 10 }, [0, 0, 0])
    for (let j = 0; j < h.ny; j++)
      for (let i = 0; i < h.nx; i++) if (Math.hypot(h.x0 + i * h.cell - 20, h.y0 + j * h.cell - 20) < 8) h.heights[j * h.nx + i] = -3
    const at45: Vec3 = [20 + 8 * Math.SQRT1_2, 20 + 8 * Math.SQRT1_2, 0]
    const f = heightfieldFeatures(h, at45, 2)
    expect(f.vertices).toEqual([])
    expect(snapToFeatures(at45, f, 1).kind).toBe('edge')
  })
})

describe('snapping', () => {
  it('prefers a corner, then a hole center, then an edge, then the path, then the surface', () => {
    const holes = holeFeatures([{ x: 5, y: 5, radius: 2, bottom: -8, last: 0 }], () => 0)
    expect(snapToFeatures([5.3, 5.2, 0], holes, 1)).toEqual({ point: [5, 5, 0], kind: 'center' })
    expect(snapToFeatures([7.1, 5, 0], holes, 0.5).kind).toBe('edge')
    expect(snapToFeatures([20, 20, 0], holes, 0.5, [[20.2, 20, 0]])).toEqual({ point: [20.2, 20, 0], kind: 'path' })
    expect(snapToFeatures([30, 30, 0], holes, 0.5)).toEqual({ point: [30, 30, 0], kind: 'surface' })
    const both = { vertices: [[1, 0, 0] as Vec3], centers: [[0, 0, 0] as Vec3], edges: [] }
    expect(snapToFeatures([0.4, 0, 0], both, 1).kind).toBe('vertex')
  })
})
