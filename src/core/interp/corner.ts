// Direct chamfer and corner R (",C" ",R"): the corner between two lines is cut by a chamfer line or a
// tangent arc, in the plane of the two lines.
import { NO_LENGTH } from '../tolerance'
import type { Move, PlaneElement, Vec2, Vec3 } from '../types'
import type { DiagnosticCode } from './diagnostics'

/** A ",C"/",R" block waits for the next move to know the corner it rounds or chamfers. */
export interface Corner {
  /** C: chamfer by its legs (Fanuc ,C / Siemens CHR); F: chamfer by its own length (Siemens CHF); R: round. */
  kind: 'C' | 'F' | 'R'
  size: number
  move: Move
  /** C/R without comma (lathe option): the next move must be at 90°. */
  perpendicular: boolean
}

export type CornerResult =
  /** Next to an arc: the corner stays sharp, reported as not simulated. */
  | { kind: 'not-simulated' }
  /** The lines go straight on: there is no corner to cut. */
  | { kind: 'straight' }
  | { kind: 'error'; code: DiagnosticCode; params?: Record<string, string | number> }
  /** Both lines shortened, and the corner move that goes between them. */
  | { kind: 'cut'; prev: Partial<Move>; next: Partial<Move>; corner: Move }

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k]
const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const flat = (q: Vec3): Vec2 => [q[0], q[1]]

/** The corner between c.move and the next line (both are two-point lines). */
export function cutCorner(c: Corner, next: Move): CornerResult {
  const prev = c.move
  const [A0, P] = prev.points
  const [, B1] = next.points
  if (prev.element?.type === 'arc' || next.element?.type === 'arc' || prev.points.length !== 2 || next.points.length !== 2 || !A0 || !P || !B1)
    return { kind: 'not-simulated' }
  const L1 = norm(sub(P, A0))
  const L2 = norm(sub(B1, P))
  if (L1 < NO_LENGTH || L2 < NO_LENGTH) return { kind: 'error', code: 'corner-without-move' }
  const d1 = mul(sub(P, A0), 1 / L1)
  const d2 = mul(sub(B1, P), 1 / L2)
  const cos = Math.min(1, Math.max(-1, d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2]))
  if (c.perpendicular && Math.abs(cos) > 1e-6) return { kind: 'error', code: 'corner-taper' }
  const phi = Math.acos(cos)
  if (phi < 1e-9) return { kind: 'straight' }
  // How far the corner starts from the programmed intersection, along each line
  const t = c.kind === 'C' ? c.size : c.kind === 'F' ? c.size / (2 * Math.cos(phi / 2)) : c.size * Math.tan(phi / 2)
  if (t > L1 + NO_LENGTH || t > L2 + NO_LENGTH) return { kind: 'error', code: 'corner-too-large', params: { size: c.size } }
  const A = add(P, mul(d1, -t))
  const B = add(P, mul(d2, t))
  const inPlane = !!prev.element && !!next.element
  let points: Vec3[] = [A, B]
  let element: PlaneElement | undefined = inPlane ? { type: 'line', p0: flat(A), p1: flat(B) } : undefined
  if (c.kind === 'R') {
    // Tangent arc: its center is R from A toward the inside of the turn
    const inward = sub(d2, mul(d1, cos))
    const n = mul(inward, 1 / norm(inward))
    const center = add(A, mul(n, c.size))
    const steps = Math.max(4, Math.ceil(phi / (Math.PI / 24)))
    points = Array.from({ length: steps + 1 }, (_, i) => {
      const a = (phi * i) / steps
      return add(center, add(mul(n, -c.size * Math.cos(a)), mul(d1, c.size * Math.sin(a))))
    })
    const cross = d1[0] * d2[1] - d1[1] * d2[0]
    if (inPlane) element = { type: 'arc', center: flat(center), radius: c.size, cw: cross < 0, p0: flat(A), p1: flat(B), sweep: phi }
  }
  // Shorten both lines; times scale with length at the same feed
  const rate1 = prev.durationS / L1
  const rate2 = next.durationS / L2
  let length = 0
  for (let i = 1; i < points.length; i++) length += norm(sub(points[i] as Vec3, points[i - 1] as Vec3))
  const { compStart: _start, compCancel: _cancel, element: _element, ...base } = prev
  return {
    kind: 'cut',
    prev: { points: [A0, A], durationS: rate1 * (L1 - t), ...(prev.element?.type === 'line' ? { element: { ...prev.element, p1: flat(A) } } : {}) },
    next: { points: [B, B1], durationS: rate2 * (L2 - t), ...(next.element?.type === 'line' ? { element: { ...next.element, p0: flat(B) } } : {}) },
    corner: { ...base, points, durationS: rate2 * length, inCompPlane: inPlane, ...(element ? { element } : {}) }
  }
}
