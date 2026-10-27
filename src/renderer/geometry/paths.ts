// The toolpath as line buffers, and the small transforms the 3D view uses between frames.
import type { Move, Vec3 } from '@core/index'

/** Machine coordinates to the scene: mills draw machine Z up (scene Y). */
export const toScene = (p: Vec3, lathe: boolean): Vec3 => (lathe ? p : [p[0], p[2], -p[1]])

/** Point p scaled by k. */
export const scaled = ([x, y, z]: [number, number, number], k: number): Vec3 => [x * k, y * k, z * k]

/** Point p turned by angle a (radians) around the Z axis. */
export const rotateZ = (p: Vec3, a: number): Vec3 => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]]

/** All segments of one layer in a single buffer; starts[k] = vertices before move k. */
export interface Layer {
  positions: Float32Array
  starts: Int32Array
}

export function buildLayer(moves: Move[], pick: (m: Move) => readonly Vec3[] | undefined): Layer {
  let count = 0
  for (const m of moves) {
    const p = pick(m)
    if (p && p.length > 1) count += (p.length - 1) * 2
  }
  const positions = new Float32Array(count * 3)
  const starts = new Int32Array(moves.length + 1)
  let v = 0
  moves.forEach((m, k) => {
    starts[k] = v
    const p = pick(m)
    if (!p) return
    for (let i = 0; i + 1 < p.length; i++) {
      for (const q of [p[i] as Vec3, p[i + 1] as Vec3]) {
        positions.set(q, v * 3)
        v++
      }
    }
  })
  starts[moves.length] = v
  return { positions, starts }
}

/** Nearest path vertex within `tol` of p (so a click on a line lands on its corner), else p itself. */
export function snap(p: Vec3, layers: Layer[], tol: number): Vec3 {
  let best = tol * tol
  let out = p
  for (const l of layers) {
    const v = l.positions
    for (let i = 0; i < v.length; i += 3) {
      const dx = (v[i] ?? 0) - p[0]
      const dy = (v[i + 1] ?? 0) - p[1]
      const dz = (v[i + 2] ?? 0) - p[2]
      const d = dx * dx + dy * dy + dz * dz
      if (d < best) {
        best = d
        out = [v[i] ?? 0, v[i + 1] ?? 0, v[i + 2] ?? 0]
      }
    }
  }
  return out
}
