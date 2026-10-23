// Material removal for the 3D view: a heightfield on block stock (machining centers) and a radius
// profile on bar stock (turning). Moves are applied one at a time, so the view can follow playback.
// Rapids and live tooling on lathes do not remove material here.
import type { Stock } from './config/project'
import type { Move, Vec3 } from './types'

/** Top-face heights of a block, one per grid cell. */
export interface Heightfield {
  nx: number
  ny: number
  /** Scene position of cell (0,0) center and the cell size, in mm. */
  x0: number
  y0: number
  cell: number
  top: number
  bottom: number
  heights: Float32Array
}

/** Radius of the bar along Z: index 0 is the face, each step `cell` mm toward the chuck. */
export interface TurnProfile {
  face: number
  cell: number
  radius: number
  radii: Float32Array
}

/** Cells per side at most: enough detail for pockets and contours, light enough to replay while playing. */
const MAX_CELLS = 220

/** Scene position of the stock corner (block) or face center (bar), from its work offset zero. */
export const stockOrigin = (s: Stock, zero: Vec3): Vec3 => [zero[0] + (s.offset?.X ?? 0), zero[1] + (s.offset?.Y ?? 0), zero[2] + (s.offset?.Z ?? 0)]

export function createHeightfield(s: Stock, zero: Vec3): Heightfield {
  const o = stockOrigin(s, zero)
  const sx = s.x ?? 100
  const sy = s.y ?? 80
  const cell = Math.max(0.25, Math.max(sx, sy) / MAX_CELLS)
  const nx = Math.max(2, Math.ceil(sx / cell) + 1)
  const ny = Math.max(2, Math.ceil(sy / cell) + 1)
  return { nx, ny, x0: o[0], y0: o[1], cell, top: o[2], bottom: o[2] - (s.z ?? 30), heights: new Float32Array(nx * ny).fill(o[2]) }
}

export function createProfile(s: Stock, zero: Vec3): TurnProfile {
  const o = stockOrigin(s, zero)
  const L = s.length ?? 30
  const cell = Math.max(0.1, L / 400)
  const n = Math.ceil(L / cell) + 1
  const radius = (s.diameter ?? 50) / 2
  return { face: o[2], cell, radius, radii: new Float32Array(n).fill(radius) }
}

/** Points along the move no further apart than `step`, so a tool stamp leaves no gaps. */
function samples(points: readonly Vec3[], step: number): Vec3[] {
  const out: Vec3[] = []
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as Vec3
    const b = points[i + 1] as Vec3
    const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    const n = Math.max(1, Math.ceil(len / step))
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const f = k / n
      out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f])
    }
  }
  return out
}

/** Lowers the heightfield under the tool along a feed move (flat end, or ball end when `ball`). */
export function cutHeightfield(h: Heightfield, m: Move, ball: boolean): boolean {
  if (m.kind !== 'feed') return false
  const r = Math.max(m.toolRadius, h.cell / 2)
  const path = m.toolCenter ?? m.points
  const step = Math.max(h.cell * 0.8, r * 0.15)
  const reach = Math.ceil(r / h.cell)
  let changed = false
  for (const [x, y, z] of samples(path, step)) {
    if (z >= h.top) continue
    const ci = Math.round((x - h.x0) / h.cell)
    const cj = Math.round((y - h.y0) / h.cell)
    for (let j = Math.max(0, cj - reach); j <= Math.min(h.ny - 1, cj + reach); j++) {
      const dy = h.y0 + j * h.cell - y
      for (let i = Math.max(0, ci - reach); i <= Math.min(h.nx - 1, ci + reach); i++) {
        const dx = h.x0 + i * h.cell - x
        const d2 = dx * dx + dy * dy
        if (d2 > r * r) continue
        // Ball end: the tip is the lowest point, the surface rises toward the edge
        const cut = Math.max(h.bottom, ball ? z + r - Math.sqrt(r * r - d2) : z)
        const k = j * h.nx + i
        if (cut < (h.heights[k] ?? h.top)) {
          h.heights[k] = cut
          changed = true
        }
      }
    }
  }
  return changed
}

/** Turning: the programmed radius becomes the bar radius where the tip passes (spindle turning, no live tool). */
export function cutProfile(p: TurnProfile, m: Move): boolean {
  if (m.kind !== 'feed' || m.state.liveToolOn || !m.state.spindleOn) return false
  let changed = false
  // The programmed point is the turned surface (nose radius compensation is not drawn on lathes)
  for (const [x, y, z] of samples(m.points, p.cell)) {
    const i = Math.round((p.face - z) / p.cell)
    if (i < 0 || i >= p.radii.length) continue
    const r = Math.hypot(x, y)
    if (r < (p.radii[i] ?? p.radius)) {
      p.radii[i] = r
      changed = true
    }
  }
  return changed
}

/**
 * Stock that holds everything the program cuts, with `margin` mm around it, rounded up to whole mm.
 * Block: the corner and top face set by `offset`; bar: diameter and length from the face at Z0.
 */
export function stockFromPath(moves: readonly Move[], lathe: boolean, margin = 2): Stock | null {
  const cuts = moves.filter((m) => m.kind === 'feed')
  if (!cuts.length) return null
  const ceil = (v: number) => Math.ceil(v - 1e-9)
  if (lathe) {
    let rMax = 0
    let zMin = Infinity
    let zMax = -Infinity
    for (const m of cuts)
      for (const p of m.points) {
        rMax = Math.max(rMax, Math.hypot(p[0], p[1]))
        zMin = Math.min(zMin, p[2])
        zMax = Math.max(zMax, p[2])
      }
    const face = Math.max(0, zMax)
    return { shape: 'cylinder', diameter: ceil(2 * (rMax + margin)), length: ceil(face - zMin + margin * 3), offset: { Z: face > 0 ? ceil(face) : 0 } }
  }
  let [x0, y0, z0, x1, y1, z1] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
  for (const m of cuts)
    for (const p of m.toolCenter ?? m.points) {
      x0 = Math.min(x0, p[0] - m.toolRadius)
      x1 = Math.max(x1, p[0] + m.toolRadius)
      y0 = Math.min(y0, p[1] - m.toolRadius)
      y1 = Math.max(y1, p[1] + m.toolRadius)
      z0 = Math.min(z0, p[2])
      z1 = Math.max(z1, p[2])
    }
  // The top face sits at Z0 unless the program only cuts above it
  const top = z1 > 0 && z0 > 0 ? ceil(z1) : 0
  const ox = Math.floor(x0 - margin)
  const oy = Math.floor(y0 - margin)
  return { shape: 'block', x: ceil(x1 + margin - ox), y: ceil(y1 + margin - oy), z: ceil(top - z0 + margin * 2), offset: { X: ox, Y: oy, Z: top } }
}

/** Where the work zero sits on a block: a top corner or the top center. */
export type ZeroAt = 'front-left' | 'front-right' | 'back-left' | 'back-right' | 'center'

/** Stock offset that puts the work zero at that point of the block's top face. */
export function offsetForZero(s: Stock, at: ZeroAt): NonNullable<Stock['offset']> {
  const x = s.x ?? 100
  const y = s.y ?? 80
  const fx = at === 'center' ? 0.5 : at.endsWith('right') ? 1 : 0
  const fy = at === 'center' ? 0.5 : at.startsWith('back') ? 1 : 0
  return { X: 0 - x * fx, Y: 0 - y * fy, Z: 0 }
}
