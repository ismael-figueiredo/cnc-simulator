// G02/G03 in the plane: the center from R or from the center offsets, the radius and the sweep.
import { NO_LENGTH } from '../tolerance'
import type { DiagnosticCode } from './diagnostics'

export interface Arc {
  cu: number
  cv: number
  /** Radius at the start and at the end (they differ by the end point's error). */
  r0: number
  r1: number
  /** Start angle and swept angle (radians, always positive). */
  a0: number
  sweep: number
}

export type ArcResult = { ok: true; arc: Arc } | { ok: false; code: DiagnosticCode; params?: Record<string, string | number> }

/**
 * The arc from (u0, v0) to (u1, v1): with R (negative R: the long way round), or with the center
 * offsets (iu, iv) from the start point. A full circle needs the center offsets.
 */
export function arcThrough(u0: number, v0: number, u1: number, v1: number, cw: boolean, center: { r: number } | { iu: number; iv: number }): ArcResult {
  const du = u1 - u0
  const dv = v1 - v0
  const d = Math.hypot(du, dv)
  let cu: number
  let cv: number
  if ('r' in center) {
    const R = center.r
    if (d < NO_LENGTH) return { ok: false, code: 'arc-start-equals-end' }
    let h2 = R * R - (d * d) / 4
    if (h2 < 0) {
      if (h2 > -1e-3 * Math.abs(R)) h2 = 0
      else return { ok: false, code: 'arc-radius-too-small', params: { r: +R.toFixed(4), half: +(d / 2).toFixed(4) } }
    }
    const h = Math.sqrt(h2)
    let sgn = cw ? -1 : 1
    if (R < 0) sgn = -sgn
    cu = (u0 + u1) / 2 + (-dv / d) * h * sgn
    cv = (v0 + v1) / 2 + (du / d) * h * sgn
  } else {
    cu = u0 + center.iu
    cv = v0 + center.iv
  }
  const r0 = Math.hypot(u0 - cu, v0 - cv)
  const r1 = Math.hypot(u1 - cu, v1 - cv)
  if (r0 < NO_LENGTH) return { ok: false, code: 'arc-center-missing' }
  const a0 = Math.atan2(v0 - cv, u0 - cu)
  const a1 = Math.atan2(v1 - cv, u1 - cu)
  let sweep = cw ? a0 - a1 : a1 - a0
  while (sweep <= 1e-12) sweep += 2 * Math.PI
  if (d < NO_LENGTH && !('r' in center)) sweep = 2 * Math.PI
  return { ok: true, arc: { cu, cv, r0, r1, a0, sweep } }
}
