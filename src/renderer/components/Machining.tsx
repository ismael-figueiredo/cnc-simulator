import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry, Color, LatheGeometry, Vector2 } from 'three'
import { createHeightfield, createProfile, cutHeightfield, cutProfile, type Heightfield, type Move, type Stock, type TurnProfile, type Vec3 } from '@core/index'

interface Props {
  moves: Move[]
  /** Moves up to this one (inclusive) have cut the stock. */
  index: number
  stock: Stock
  zero: Vec3
  lathe: boolean
  /** Tools with a ball end (they leave rounded grooves). */
  ballTools: Set<number>
  color: string
}

/** Machined surfaces get a light, cool tint, so cut and raw stock read apart at a glance. */
const cutColor = (base: string) => new Color(base).lerp(new Color('#bfe6ff'), 0.55)

/**
 * The stock as it is being cut. Moves are applied incrementally while playing forward;
 * seeking back starts over from the raw stock.
 */
export function Machining(props: Props) {
  return props.lathe ? <TurnedBar {...props} /> : <MilledBlock {...props} />
}

interface Replay<T> {
  model: T
  /** Index of the last move applied (-1: raw stock). */
  applied: number
  /** Bumped whenever the model changes, so memos and effects can follow it. */
  version: number
}

// Outside React: the cut model is a cache, mutated as playback goes. Each program/stock/tools
// combination gets its own key, so a new one starts from the raw stock.
const replays = new WeakMap<object, Replay<unknown>>()

/** Forward: applies the moves not applied yet. Backward: starts over from the raw stock. */
function replayTo<T>(key: object, create: () => T, apply: (model: T, m: Move) => boolean, moves: Move[], index: number): Replay<T> {
  let r = replays.get(key) as Replay<T> | undefined
  if (!r || index < r.applied) {
    r = { model: create(), applied: -1, version: (r?.version ?? 0) + 1 }
    replays.set(key, r)
  }
  let changed = false
  for (let k = r.applied + 1; k <= index; k++) {
    const m = moves[k]
    if (m && apply(r.model, m)) changed = true
  }
  r.applied = Math.max(r.applied, index)
  if (changed) r.version++
  return r
}

function MilledBlock({ moves, index, stock, zero, ballTools, color }: Props) {
  // A new program, stock or tool set starts the replay over
  const key = useMemo(() => ({ moves, stock, zero, ballTools }), [moves, stock, zero, ballTools])
  const replay = replayTo(
    key,
    () => createHeightfield(stock, zero),
    (h: Heightfield, m: Move) => cutHeightfield(h, m, ballTools.has(m.state.tool)),
    moves,
    index
  )
  const { model, version } = replay

  const geometry = useMemo(() => {
    const h = createHeightfield(stock, zero)
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(h.nx * h.ny * 3), 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(h.nx * h.ny * 3), 3))
    const idx: number[] = []
    for (let j = 0; j + 1 < h.ny; j++)
      for (let i = 0; i + 1 < h.nx; i++) {
        const a = j * h.nx + i
        idx.push(a, a + 1, a + h.nx, a + 1, a + h.nx + 1, a + h.nx)
      }
    g.setIndex(idx)
    return g
  }, [stock, zero])

  useEffect(() => {
    const pos = geometry.getAttribute('position') as BufferAttribute
    const col = geometry.getAttribute('color') as BufferAttribute
    const raw = new Color(color)
    const cut = cutColor(color)
    for (let j = 0; j < model.ny; j++)
      for (let i = 0; i < model.nx; i++) {
        const k = j * model.nx + i
        const z = model.heights[k] ?? model.top
        pos.setXYZ(k, model.x0 + i * model.cell, model.y0 + j * model.cell, z)
        const c = z < model.top - 1e-3 ? cut : raw
        col.setXYZ(k, c.r, c.g, c.b)
      }
    pos.needsUpdate = true
    col.needsUpdate = true
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()
  }, [geometry, model, version, color])

  return (
    <mesh geometry={geometry}>
      {/* Pushed back a little so the toolpath drawn on the cut surface stays visible */}
      <meshStandardMaterial vertexColors metalness={0.45} roughness={0.45} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
    </mesh>
  )
}

function TurnedBar({ moves, index, stock, zero, color }: Props) {
  const key = useMemo(() => ({ moves, stock, zero }), [moves, stock, zero])
  const { model, version } = replayTo(key, () => createProfile(stock, zero), (p: TurnProfile, m: Move) => cutProfile(p, m), moves, index)

  // The profile is cut in place: `version` tells the memo it changed
  const geometry = useMemo(() => barGeometry(model, color, version), [model, color, version])

  return (
    // LatheGeometry turns around +Y; the spindle axis is Z
    <mesh geometry={geometry} rotation={[Math.PI / 2, 0, 0]}>
      <meshStandardMaterial vertexColors metalness={0.5} roughness={0.4} transparent opacity={0.85} depthWrite={false} />
    </mesh>
  )
}

/** Turned bar: the outline from the axis at the face, along the radii, back to the axis at the chuck end. */
function barGeometry(p: TurnProfile, color: string, _version: number): LatheGeometry {
  const back = p.face - (p.radii.length - 1) * p.cell
  const pts = [new Vector2(0, p.face)]
  p.radii.forEach((r, i) => pts.push(new Vector2(Math.max(r, 0.01), p.face - i * p.cell)))
  pts.push(new Vector2(0, back))
  const g = new LatheGeometry(pts, 72)
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
