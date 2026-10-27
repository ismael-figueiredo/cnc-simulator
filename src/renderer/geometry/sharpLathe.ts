import { LatheGeometry, Vector2 } from 'three'

/** Turns sharper than this (radians) between two outline segments are drawn as an edge. */
const EDGE = (20 * Math.PI) / 180

/**
 * LatheGeometry with sharp edges. LatheGeometry averages the normals of the two segments meeting at
 * each outline point, so a shoulder or a flange shades as if it were rounded. A corner given twice gets
 * one normal per side (the zero-length segment between the copies adds nothing to either).
 */
export function sharpLathe(points: readonly Vector2[], segments: number): LatheGeometry {
  const out: Vector2[] = []
  points.forEach((p, i) => {
    out.push(p)
    const a = points[i - 1]
    const b = points[i + 1]
    if (!a || !b) return
    const turn = Math.abs(Math.atan2(b.y - p.y, b.x - p.x) - Math.atan2(p.y - a.y, p.x - a.x))
    if (Math.min(turn, 2 * Math.PI - turn) > EDGE) out.push(p.clone())
  })
  return new LatheGeometry(out, segments)
}
