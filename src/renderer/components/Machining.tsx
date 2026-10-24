import { useEffect, useMemo, useRef } from 'react'
import { BufferAttribute, BufferGeometry, Color, LatheGeometry, Sphere, Vector2, Vector3 } from 'three'
import { takeDirty, createHeightfield, createProfile, cutHeightfield, cutProfile, type Heightfield, type Move, type Stock, type TurnProfile, type Vec3 } from '@core/index'

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
function replayTo<T>(
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

const copyHeightfield = (h: Heightfield): Heightfield => ({ ...h, heights: h.heights.slice() })
const copyProfile = (p: TurnProfile): TurnProfile => ({ ...p, radii: p.radii.slice() })

function MilledBlock({ moves, index, stock, zero, ballTools, color }: Props) {
  // A new program, stock or tool set starts the replay over
  const key = useMemo(() => ({ moves, stock, zero, ballTools }), [moves, stock, zero, ballTools])
  const replay = replayTo(
    key,
    () => createHeightfield(stock, zero),
    copyHeightfield,
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
    g.setAttribute('normal', new BufferAttribute(new Float32Array(h.nx * h.ny * 3), 3))
    // The surface stays inside the stock box: a fixed bounding sphere, not recomputed per frame
    g.boundingSphere = new Sphere(new Vector3(h.x0 + (h.nx * h.cell) / 2, h.y0 + (h.ny * h.cell) / 2, (h.top + h.bottom) / 2), Math.hypot(h.nx * h.cell, h.ny * h.cell, h.top - h.bottom))
    const idx: number[] = []
    for (let j = 0; j + 1 < h.ny; j++)
      for (let i = 0; i + 1 < h.nx; i++) {
        const a = j * h.nx + i
        idx.push(a, a + 1, a + h.nx, a + 1, a + h.nx + 1, a + h.nx)
      }
    g.setIndex(idx)
    return g
  }, [stock, zero])
  useEffect(() => () => geometry.dispose(), [geometry])

  // Which model the mesh shows: a new model (new stock, checkpoint restore) redraws it all,
  // the same one only the cells the tool touched since the last frame.
  const shown = useRef<{ model: Heightfield; color: string } | null>(null)
  useEffect(() => {
    const full = shown.current?.model !== model || shown.current.color !== color
    const changed = takeDirty(model)
    const region = full ? ([0, 0, model.nx - 1, model.ny - 1] as const) : changed
    shown.current = { model, color }
    if (!region) return
    writeCells(geometry, model, region, color)
  }, [geometry, model, version, color])

  return (
    <mesh geometry={geometry}>
      {/* Pushed back a little so the toolpath drawn on the cut surface stays visible */}
      <meshStandardMaterial vertexColors metalness={0.45} roughness={0.45} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
    </mesh>
  )
}

/**
 * Writes positions, normals and colors of the cells in the region (plus one cell around, whose
 * normals depend on them) and uploads only those rows to the GPU.
 */
function writeCells(g: BufferGeometry, h: Heightfield, [i0, j0, i1, j1]: readonly [number, number, number, number], color: string) {
  const pos = g.getAttribute('position') as BufferAttribute
  const nor = g.getAttribute('normal') as BufferAttribute
  const col = g.getAttribute('color') as BufferAttribute
  const raw = new Color(color)
  const cut = cutColor(color)
  const at = (i: number, j: number) => h.heights[Math.min(h.ny - 1, Math.max(0, j)) * h.nx + Math.min(h.nx - 1, Math.max(0, i))] ?? h.top
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
}

function TurnedBar({ moves, index, stock, zero, color }: Props) {
  const key = useMemo(() => ({ moves, stock, zero }), [moves, stock, zero])
  const { model, version } = replayTo(key, () => createProfile(stock, zero), copyProfile, (p: TurnProfile, m: Move) => cutProfile(p, m), moves, index)

  // The profile is cut in place: `version` tells the memo it changed
  const geometry = useMemo(() => barGeometry(model, color, version), [model, color, version])
  // Each version is a new geometry: free the previous one on the GPU
  useEffect(() => () => geometry.dispose(), [geometry])

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
