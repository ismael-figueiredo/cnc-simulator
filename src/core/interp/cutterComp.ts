// Cutter radius compensation (G41/G42) in the compensation plane.
// Works on chains of moves: start-up move → elements → cancel move. Each element is offset by the
// tool radius; convex corners get an arc around the corner, concave corners are trimmed to the
// intersection. A visual approximation of the Fanuc behavior (type A start-up/cancel).
import { SAME_POSITION } from '../tolerance'
import type { Diagnostic, Move, PlaneElement, Vec2, Vec3 } from '../types'

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]]
const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]]
const scale = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k]
const len = (a: Vec2) => Math.hypot(a[0], a[1])
const unit = (a: Vec2): Vec2 => {
  const l = len(a)
  return l < 1e-15 ? [0, 0] : [a[0] / l, a[1] / l]
}
const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0]

type Offset =
  | { type: 'line'; p0: Vec2; p1: Vec2; dir: Vec2 }
  | { type: 'arc'; p0: Vec2; p1: Vec2; center: Vec2; radius: number; cw: boolean; sweep?: number; collapsed: boolean }

function tangentAt(e: PlaneElement, p: Vec2): Vec2 {
  if (e.type === 'line') return unit(sub(e.p1, e.p0))
  const u = unit(sub(p, e.center))
  return e.cw ? [u[1], -u[0]] : [-u[1], u[0]]
}

/** side = +1 for G41 (tool on the left), -1 for G42. */
function offsetElement(e: PlaneElement, side: number, r: number): Offset {
  if (e.type === 'line') {
    const dir = unit(sub(e.p1, e.p0))
    const n = scale([-dir[1], dir[0]], side * r)
    return { type: 'line', p0: add(e.p0, n), p1: add(e.p1, n), dir }
  }
  const r2 = e.radius + (e.cw ? 1 : -1) * side * r
  const u0 = unit(sub(e.p0, e.center))
  const u1 = unit(sub(e.p1, e.center))
  return {
    type: 'arc',
    p0: add(e.center, scale(u0, r2)),
    p1: add(e.center, scale(u1, r2)),
    center: e.center,
    radius: r2,
    cw: e.cw,
    sweep: e.sweep,
    collapsed: r2 <= 1e-6
  }
}

function intersect(a: Offset, b: Offset): Vec2[] {
  if (a.type === 'line' && b.type === 'line') {
    const d1 = sub(a.p1, a.p0)
    const d2 = sub(b.p1, b.p0)
    const den = cross(d1, d2)
    if (Math.abs(den) < 1e-12) return []
    return [add(a.p0, scale(d1, cross(sub(b.p0, a.p0), d2) / den))]
  }
  if (a.type === 'arc' && b.type === 'line') return intersect(b, a)
  if (a.type === 'line' && b.type === 'arc') {
    const d = unit(sub(a.p1, a.p0))
    const f = sub(a.p0, b.center)
    const B = 2 * (f[0] * d[0] + f[1] * d[1])
    const C = f[0] * f[0] + f[1] * f[1] - b.radius * b.radius
    const disc = B * B - 4 * C
    if (disc < -1e-9) return []
    const sq = Math.sqrt(Math.max(0, disc))
    return [add(a.p0, scale(d, (-B - sq) / 2)), add(a.p0, scale(d, (-B + sq) / 2))]
  }
  if (a.type === 'arc' && b.type === 'arc') {
    const dv = sub(b.center, a.center)
    const d = len(dv)
    if (d < 1e-12) return []
    const x = (a.radius * a.radius - b.radius * b.radius + d * d) / (2 * d)
    const h2 = a.radius * a.radius - x * x
    if (h2 < -1e-9) return []
    const h = Math.sqrt(Math.max(0, h2))
    const u = scale(dv, 1 / d)
    const m = add(a.center, scale(u, x))
    return [add(m, scale([-u[1], u[0]], h)), add(m, scale([u[1], -u[0]], h))]
  }
  return []
}

/** Samples an offset element; reports a gouge when trimming reversed the element. */
function sample(o: Offset, z0: number, z1: number, onGouge: () => void, lift: Lift = XY): Vec3[] {
  if (o.type === 'line') {
    if ((o.p1[0] - o.p0[0]) * o.dir[0] + (o.p1[1] - o.p0[1]) * o.dir[1] < -SAME_POSITION) onGouge()
    return [lift.to3(o.p0, z0), lift.to3(o.p1, z1)]
  }
  const a0 = Math.atan2(o.p0[1] - o.center[1], o.p0[0] - o.center[0])
  const a1 = Math.atan2(o.p1[1] - o.center[1], o.p1[0] - o.center[0])
  let sw = o.cw ? a0 - a1 : a1 - a0
  while (sw < 0) sw += 2 * Math.PI
  if (o.sweep !== undefined && sw > o.sweep + Math.PI && o.sweep < 2 * Math.PI - 1e-6) {
    onGouge()
    sw = 0
  }
  const n = Math.max(2, Math.ceil((sw / (2 * Math.PI)) * 120))
  const pts: Vec3[] = []
  for (let k = 0; k <= n; k++) {
    const f = k / n
    const a = a0 + (o.cw ? -1 : 1) * sw * f
    pts.push(lift.to3([o.center[0] + o.radius * Math.cos(a), o.center[1] + o.radius * Math.sin(a)], z0 + (z1 - z0) * f))
  }
  return pts
}

/** From the compensation plane back to 3D: XY keeps z as the third axis; turning (ZX) puts u on z and v on the radius. */
interface Lift {
  to3: (p: Vec2, h: number) => Vec3
  height: (p: Vec3) => number
}
const XY: Lift = { to3: (p, h) => [p[0], p[1], h], height: (p) => p[2] }
const ZX: Lift = { to3: (p, h) => [p[1], h, p[0]], height: (p) => p[1] }

const first = (m: Move): Vec3 => m.points[0] ?? [0, 0, 0]
const last = (m: Move): Vec3 => m.points[m.points.length - 1] ?? [0, 0, 0]

/**
 * Fills `toolCenter` on every move of every compensated chain. Problems are reported with the index
 * of the move where the machine would stop.
 */
export function applyCutterComp(moves: Move[], report: (d: Diagnostic) => void): void {
  const at = (q: Move) => moves.indexOf(q)
  for (let i = 0; i < moves.length; i++) {
    const start = moves[i]
    if (!start?.compStart) continue
    const chain: Move[] = [start]
    let j = i + 1
    while (j < moves.length) {
      const q = moves[j]
      if (!q || q.kind === 'rapid' || !q.inCompPlane) break
      chain.push(q)
      if (q.compCancel) break
      j++
    }
    i = j

    const side = start.compStart === 41 ? 1 : -1
    const lift = chain.some((q) => q.compPlane === 'zx') ? ZX : XY
    const r = start.toolRadius
    if (!(r > 0)) {
      report({ severity: 'warning', line: start.line, code: 'comp-zero-radius', params: { g: start.compStart }, moveIndex: at(start) })
      continue
    }
    const endMove = chain[chain.length - 1]
    const cancel = endMove?.compCancel && chain.length > 1 ? endMove : undefined
    const body = chain.slice(1, cancel ? -1 : undefined).filter((q) => q.element)
    if (!body.length) continue

    const offs = body.map((q) => {
      const o = offsetElement(q.element as PlaneElement, side, r)
      if (o.type === 'arc' && o.collapsed && q.element?.type === 'arc')
        report({
          severity: 'alarm',
          line: q.line,
          code: 'tool-larger-than-arc',
          params: { tool: r, arc: +q.element.radius.toFixed(3) },
          moveIndex: at(q)
        })
      return o
    })

    const cornerExtra: Vec3[][] = body.map(() => [])
    for (let k = 0; k + 1 < body.length; k++) {
      const qe = body[k] as Move
      const e = qe.element
      const f = body[k + 1]?.element
      const oe = offs[k]
      const of = offs[k + 1]
      const zEnd = lift.height(last(qe))
      if (!e || !f || !oe || !of) continue
      if (len(sub(oe.p1, of.p0)) < SAME_POSITION) {
        of.p0 = oe.p1
        continue
      }
      const corner = e.p1
      const turn = cross(tangentAt(e, e.p1), tangentAt(f, f.p0))
      if (turn * side < -1e-9) {
        // convex corner: arc of tool radius around it
        const arc: Offset = { type: 'arc', p0: oe.p1, p1: of.p0, center: corner, radius: r, cw: side > 0, collapsed: false }
        cornerExtra[k] = sample(arc, zEnd, zEnd, () => undefined, lift).slice(1)
      } else {
        // concave corner: trim both to the intersection closest to the corner
        let best: Vec2 | null = null
        let bestD = Infinity
        for (const c of intersect(oe, of)) {
          const d = len(sub(c, corner))
          if (d < bestD) {
            bestD = d
            best = c
          }
        }
        if (best && bestD < r * 4 + 1) {
          oe.p1 = best
          of.p0 = best
        } else {
          report({ severity: 'alarm', line: body[k + 1]?.line ?? qe.line, code: 'comp-no-solution', moveIndex: at(body[k + 1] ?? qe) })
          cornerExtra[k] = [lift.to3(of.p0, zEnd)]
        }
      }
    }

    const o0 = offs[0]
    if (o0) start.toolCenter = [first(start), lift.to3(o0.p0, lift.height(last(start)))]
    body.forEach((q, k) => {
      const o = offs[k]
      if (!o) return
      q.toolCenter = sample(
        o,
        lift.height(first(q)),
        lift.height(last(q)),
        () => {
          report({ severity: 'alarm', line: q.line, code: o.type === 'line' ? 'comp-gouge-line' : 'comp-gouge-arc', moveIndex: at(q) })
        },
        lift
      ).concat(cornerExtra[k] ?? [])
    })
    const oLast = offs[offs.length - 1]
    if (cancel && oLast) cancel.toolCenter = [lift.to3(oLast.p1, lift.height(first(cancel))), last(cancel)]
    // Z-only moves inside the chain keep the compensated point
    for (const q of chain) if (!q.toolCenter && !q.element) q.toolCenter = q.points
  }
}
