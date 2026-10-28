// Meshes of the stock being cut, and the replay of the cuts as playback moves: plain three.js
// geometry, so the 3D view only draws it and the tests can check it.
import { BufferAttribute, BufferGeometry, Color, LatheGeometry, Sphere, Uint32BufferAttribute, Vector2, Vector3 } from 'three'
import type { Heightfield, Hole, Move, TurnProfile } from '@core/index'
import { sharpLathe } from './sharpLathe'

/** Machined surfaces get a light, cool tint, so cut and raw stock read apart at a glance. */
export const cutColor = (base: string) => new Color(base).lerp(new Color('#bfe6ff'), 0.55)

export interface Replay<T> {
  model: T
  /** Index of the last move applied (-1: raw stock). */
  applied: number
  /** Bumped whenever the model changes, so memos and effects can follow it. */
  version: number
  /** Copies of the model taken on the way forward, by the index of the last move applied. */
  checkpoints: { applied: number; model: T }[]
}

// Outside React: the cut model is a cache, mutated as playback goes. Each program/stock/tools
// combination gets its own key, so a new one starts from the raw stock.
const replays = new WeakMap<object, Replay<unknown>>()

/** At most this many checkpoints per replay (each is a copy of the heightfield or profile). */
const MAX_CHECKPOINTS = 64
const MIN_CHECKPOINT_STEP = 500

/**
 * Forward: applies the moves not applied yet. Backward: restarts from the last checkpoint at or
 * before the index (raw stock if none), so seeking back in a long program does not replay it all.
 */
export function replayTo<T>(
  key: object,
  create: () => T,
  copy: (model: T) => T,
  apply: (model: T, m: Move) => boolean,
  moves: Move[],
  index: number
): Replay<T> {
  let r = replays.get(key) as Replay<T> | undefined
  if (!r) {
    r = { model: create(), applied: -1, version: 0, checkpoints: [] }
    replays.set(key, r)
  } else if (index < r.applied) {
    let cp: Replay<T>['checkpoints'][number] | undefined
    for (const c of r.checkpoints) if (c.applied <= index && (!cp || c.applied > cp.applied)) cp = c
    r.model = cp ? copy(cp.model) : create()
    r.applied = cp ? cp.applied : -1
    r.version++
  }
  const every = Math.max(MIN_CHECKPOINT_STEP, Math.ceil(moves.length / MAX_CHECKPOINTS))
  let changed = false
  for (let k = r.applied + 1; k <= index; k++) {
    const m = moves[k]
    if (m && apply(r.model, m)) changed = true
    if ((k + 1) % every === 0 && !r.checkpoints.some((c) => c.applied === k)) r.checkpoints.push({ applied: k, model: copy(r.model) })
  }
  r.applied = Math.max(r.applied, index)
  if (changed) r.version++
  return r
}

export const copyHeightfield = (h: Heightfield): Heightfield => ({ ...h, heights: h.heights.slice() })
export const copyProfile = (p: TurnProfile): TurnProfile => ({ ...p, radii: p.radii.slice() })

/** Whether the hole's center is on this stock (a program can drill parts in other vises too). */
const onStock = (h: Heightfield, hole: Hole) =>
  hole.x >= h.x0 && hole.x <= h.x0 + (h.nx - 1) * h.cell && hole.y >= h.y0 && hole.y <= h.y0 + (h.ny - 1) * h.cell

/** Cells drawn at the hole's bottom: inside it and one cell around, so no slanted triangle shows in it. */
export function seatHole(floor: Float32Array, h: Heightfield, hole: Hole) {
  if (!onStock(h, hole)) return
  const reach = hole.radius + h.cell * 1.5
  const i0 = Math.max(0, Math.floor((hole.x - reach - h.x0) / h.cell))
  const i1 = Math.min(h.nx - 1, Math.ceil((hole.x + reach - h.x0) / h.cell))
  const j0 = Math.max(0, Math.floor((hole.y - reach - h.y0) / h.cell))
  const j1 = Math.min(h.ny - 1, Math.ceil((hole.y + reach - h.y0) / h.cell))
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      if (Math.hypot(h.x0 + i * h.cell - hole.x, h.y0 + j * h.cell - hole.y) > reach) continue
      const k = j * h.nx + i
      floor[k] = Math.min(floor[k] ?? Infinity, Math.max(h.bottom, hole.bottom))
    }
}

const HOLE_SEGMENTS = 40

/**
 * The drilled holes as real round holes: a straight wall from the bottom up to the surface around the
 * hole, and a ring on the surface that covers the cells' jagged edge (and the lowered seat under it).
 */
export function holeGeometry(holes: readonly Hole[], h: Heightfield, color: string) {
  const wall: number[] = []
  const rim: number[] = []
  const rimColor: number[] = []
  const raw = new Color(color)
  const cut = cutColor(color)
  const heightAt = (x: number, y: number) => {
    const i = Math.min(h.nx - 1, Math.max(0, Math.round((x - h.x0) / h.cell)))
    const j = Math.min(h.ny - 1, Math.max(0, Math.round((y - h.y0) / h.cell)))
    return h.heights[j * h.nx + i] ?? h.top
  }
  for (const hole of holes) {
    if (!onStock(h, hole)) continue
    const outer = hole.radius + h.cell * 2.6
    // The surface the hole was drilled from: the highest point just outside the ring
    let top = -Infinity
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2
      top = Math.max(top, heightAt(hole.x + Math.cos(a) * (outer + h.cell), hole.y + Math.sin(a) * (outer + h.cell)))
    }
    const bottom = Math.max(h.bottom, hole.bottom)
    if (top <= bottom) continue
    const c = top < h.top - 1e-3 ? cut : raw
    for (let k = 0; k < HOLE_SEGMENTS; k++) {
      const a0 = (k / HOLE_SEGMENTS) * Math.PI * 2
      const a1 = ((k + 1) / HOLE_SEGMENTS) * Math.PI * 2
      const p = (r: number, a: number, z: number) => [hole.x + Math.cos(a) * r, hole.y + Math.sin(a) * r, z]
      const [w0, w1, w2, w3] = [p(hole.radius, a0, bottom), p(hole.radius, a1, bottom), p(hole.radius, a1, top), p(hole.radius, a0, top)]
      wall.push(...w0, ...w1, ...w2, ...w0, ...w2, ...w3)
      const z = top + 0.01
      const [r0, r1, r2, r3] = [p(hole.radius, a0, z), p(outer, a0, z), p(outer, a1, z), p(hole.radius, a1, z)]
      rim.push(...r0, ...r1, ...r2, ...r0, ...r2, ...r3)
      for (let n = 0; n < 6; n++) rimColor.push(c.r, c.g, c.b)
    }
  }
  const walls = new BufferGeometry()
  walls.setAttribute('position', new BufferAttribute(new Float32Array(wall), 3))
  walls.computeVertexNormals()
  const rims = new BufferGeometry()
  rims.setAttribute('position', new BufferAttribute(new Float32Array(rim), 3))
  rims.setAttribute('color', new BufferAttribute(new Float32Array(rimColor), 3))
  rims.computeVertexNormals()
  return { walls, rims }
}

/**
 * Writes positions, normals and colors of the cells in the region (plus one cell around, whose
 * normals depend on them) and uploads only those rows to the GPU.
 */
export function writeCells(g: BufferGeometry, h: Heightfield, [i0, j0, i1, j1]: readonly [number, number, number, number], color: string, floor?: Float32Array) {
  const pos = g.getAttribute('position') as BufferAttribute
  const nor = g.getAttribute('normal') as BufferAttribute
  const col = g.getAttribute('color') as BufferAttribute
  const raw = new Color(color)
  const cut = cutColor(color)
  const at = (i: number, j: number) => {
    const k = Math.min(h.ny - 1, Math.max(0, j)) * h.nx + Math.min(h.nx - 1, Math.max(0, i))
    return Math.min(h.heights[k] ?? h.top, floor?.[k] ?? Infinity)
  }
  const ja = Math.max(0, j0 - 1)
  const jb = Math.min(h.ny - 1, j1 + 1)
  const ia = Math.max(0, i0 - 1)
  const ib = Math.min(h.nx - 1, i1 + 1)
  for (let j = ja; j <= jb; j++)
    for (let i = ia; i <= ib; i++) {
      const k = j * h.nx + i
      const z = at(i, j)
      pos.setXYZ(k, h.x0 + i * h.cell, h.y0 + j * h.cell, z)
      // Normal of a heightfield from its slopes (central differences): cheaper than computeVertexNormals
      const dx = (at(i + 1, j) - at(i - 1, j)) / (2 * h.cell)
      const dy = (at(i, j + 1) - at(i, j - 1)) / (2 * h.cell)
      const n = 1 / Math.hypot(dx, dy, 1)
      nor.setXYZ(k, -dx * n, -dy * n, n)
      const c = z < h.top - 1e-3 ? cut : raw
      col.setXYZ(k, c.r, c.g, c.b)
    }
  // Whole rows ja…jb are one contiguous range of the buffers
  const start = ja * h.nx * 3
  const count = (jb - ja + 1) * h.nx * 3
  for (const a of [pos, nor, col]) {
    a.clearUpdateRanges()
    a.addUpdateRange(start, count)
    a.needsUpdate = true
  }
  // Each cell is split along the diagonal that follows the surface (the one whose corners differ
  // least), so edges of pockets and slots run straight instead of in a zigzag
  const index = g.getIndex()
  if (!index) return
  const idx = index.array as Uint32Array
  const qa = Math.max(0, ja - 1)
  const qb = Math.min(h.ny - 2, jb)
  for (let j = qa; j <= qb; j++)
    for (let i = 0; i + 1 < h.nx; i++) {
      const a = j * h.nx + i
      const b = a + 1
      const c = a + h.nx + 1
      const d = a + h.nx
      const o = (j * (h.nx - 1) + i) * 6
      if (Math.abs(at(i, j) - at(i + 1, j + 1)) <= Math.abs(at(i + 1, j) - at(i, j + 1))) idx.set([a, b, c, a, c, d], o)
      else idx.set([a, b, d, b, c, d], o)
    }
  index.clearUpdateRanges()
  index.addUpdateRange(qa * (h.nx - 1) * 6, (qb - qa + 1) * (h.nx - 1) * 6)
  index.needsUpdate = true
}

/** Turned bar: the outline from the axis at the face, along the radii, back to the axis at the chuck end. */
export function barGeometry(p: TurnProfile, color: string, _version = 0): LatheGeometry {
  const back = p.face - (p.radii.length - 1) * p.cell
  const pts = [new Vector2(0, p.face)]
  p.radii.forEach((r, i) => pts.push(new Vector2(Math.max(r, 0.01), p.face - i * p.cell)))
  pts.push(new Vector2(0, back))
  // LatheGeometry faces outward when the profile goes up its axis: from the back to the face
  const g = sharpLathe(pts.reverse(), 72)
  const pos = g.getAttribute('position') as BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  const raw = new Color(color)
  const cut = cutColor(color)
  for (let k = 0; k < pos.count; k++) {
    const c = Math.hypot(pos.getX(k), pos.getZ(k)) < p.radius - 1e-3 ? cut : raw
    colors.set([c.r, c.g, c.b], k * 3)
  }
  g.setAttribute('color', new BufferAttribute(colors, 3))
  return g
}

/** A heightfield's surface: one vertex per point, two triangles per cell (written by writeCells). */
export function gridGeometry(h: Heightfield) {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(h.nx * h.ny * 3), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(h.nx * h.ny * 3), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(h.nx * h.ny * 3), 3))
  // The surface stays inside the stock box: a fixed bounding sphere, not recomputed per frame
  g.boundingSphere = new Sphere(new Vector3(h.x0 + (h.nx * h.cell) / 2, h.y0 + (h.ny * h.cell) / 2, (h.top + h.bottom) / 2), Math.hypot(h.nx * h.cell, h.ny * h.cell, h.top - h.bottom))
  // Two triangles per cell, their diagonal chosen per cell in writeCells
  g.setIndex(new Uint32BufferAttribute(new Uint32Array((h.nx - 1) * (h.ny - 1) * 6), 1))
  return g
}
