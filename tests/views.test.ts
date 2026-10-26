import { describe, expect, it } from 'vitest'
import { viewAngles, viewDirection } from '../src/renderer/views'

const dir = (kind: 'iso' | 'top' | 'front' | 'side', lathe = false) => viewDirection(viewAngles(kind, lathe)).map((v) => Math.round(v * 1e9) / 1e9 + 0)

describe('standard 3D views', () => {
  it('look straight along an axis, with no tilt left', () => {
    expect(dir('top')).toEqual([0, 1, 0])
    expect(dir('front')).toEqual([0, 0, 1])
    expect(dir('side')).toEqual([1, 0, 0])
  })

  it('isometric sees the three axes at the same angle', () => {
    const [x, y, z] = dir('iso')
    expect(x).toBeCloseTo(1 / Math.sqrt(3), 9)
    expect(y).toBeCloseTo(1 / Math.sqrt(3), 9)
    expect(z).toBeCloseTo(1 / Math.sqrt(3), 9)
  })

  it('the lathe top view is the drawing view (turned so Z runs across the screen)', () => {
    expect(dir('top', true)).toEqual([0, 1, 0])
    expect(viewAngles('top', true).azimuth).toBeCloseTo(-Math.PI / 2, 12)
  })
})
