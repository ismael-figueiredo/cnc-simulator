import { useEffect, useMemo, useRef } from 'react'
import { BackSide, Color } from 'three'
import {
  takeDirty,
  copyBarModel,
  createBarModel,
  createHeightfield,
  createProfile,
  cutBar,
  cutHeightfield,
  cutProfile,
  hasLiveCuts,
  holesOf,
  type BarModel,
  type Heightfield,
  type Move,
  type Stock,
  type TurnProfile,
  type Vec3
} from '@core/index'
import { disposeLiveBar, drawLiveBar, liveBarParts } from '../geometry/liveBar'
import { barGeometry, copyHeightfield, copyProfile, gridGeometry, holeGeometry, replayTo, seatHole, writeCells } from '../geometry/machined'

interface Props {
  moves: Move[]
  /** Moves up to this one (inclusive) have cut the stock. */
  index: number
  stock: Stock
  zero: Vec3
  lathe: boolean
  /** Tools with a ball end (they leave rounded grooves). */
  ballTools: Set<number>
  /** Lathe live tools mounted radially (their axis toward the spindle axis). */
  radialTools?: Set<number>
  color: string
}

/**
 * The stock as it is being cut. Moves are applied incrementally while playing forward;
 * seeking back starts over from the raw stock.
 */
export function Machining(props: Props) {
  // Live tooling cuts more than a turned shape: those programs get the two-map bar model
  const live = useMemo(() => props.lathe && hasLiveCuts(props.moves), [props.lathe, props.moves])
  if (!props.lathe) return <MilledBlock {...props} />
  return live ? <LiveToolBar {...props} /> : <TurnedBar {...props} />
}

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

  const geometry = useMemo(() => gridGeometry(createHeightfield(stock, zero)), [stock, zero])

  // Holes of the drilling cycles, drawn as real cylinders once playback has drilled them
  const holes = useMemo(() => holesOf(moves), [moves])
  const drilled = useMemo(() => holes.filter((h) => h.last <= index).length, [holes, index])
  /** Lowest Z drawn per cell: the seat of each drilled hole is drawn at its bottom (drawing only). */
  const floor = useMemo(() => {
    const h = createHeightfield(stock, zero)
    const f = new Float32Array(h.nx * h.ny).fill(Infinity)
    for (const hole of holes.slice(0, drilled)) seatHole(f, h, hole)
    return f
  }, [holes, drilled, stock, zero])
  useEffect(() => () => geometry.dispose(), [geometry])

  // Which model the mesh shows: a new model (new stock, checkpoint restore) redraws it all,
  // the same one only the cells the tool touched since the last frame.
  const shown = useRef<{ model: Heightfield; color: string; floor: Float32Array } | null>(null)
  useEffect(() => {
    const full = shown.current?.model !== model || shown.current.color !== color || shown.current.floor !== floor
    const changed = takeDirty(model)
    const region = full ? ([0, 0, model.nx - 1, model.ny - 1] as const) : changed
    shown.current = { model, color, floor }
    if (!region) return
    writeCells(geometry, model, region, color, floor)
  }, [geometry, model, version, color, floor])

  // Walls and rims of the drilled holes, one geometry for all of them (rebuilt when a hole is done)
  const holeMeshes = useMemo(() => holeGeometry(holes.slice(0, drilled), model, color), [holes, drilled, model, color])
  useEffect(
    () => () => {
      holeMeshes.walls.dispose()
      holeMeshes.rims.dispose()
    },
    [holeMeshes]
  )

  return (
    <>
      <mesh geometry={geometry}>
        {/* Pushed back a little so the toolpath drawn on the cut surface stays visible */}
        <meshStandardMaterial vertexColors metalness={0.45} roughness={0.45} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
      </mesh>
      {drilled > 0 && (
        <>
          <mesh geometry={holeMeshes.walls}>
            <meshStandardMaterial color={new Color(color).lerp(new Color('#1a2026'), 0.45)} metalness={0.6} roughness={0.35} side={BackSide} />
          </mesh>
          <mesh geometry={holeMeshes.rims}>
            <meshStandardMaterial vertexColors metalness={0.45} roughness={0.45} />
          </mesh>
        </>
      )}
    </>
  )
}

/** Empty surface for a heightfield: positions, normals and colors are written by writeCells. */
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
      {/* Opaque: a see-through bar flickered as the view turned (faces sorted against the chuck);
          pushed back a little so the path drawn on its surface stays visible */}
      <meshStandardMaterial vertexColors metalness={0.5} roughness={0.4} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
    </mesh>
  )
}

/**
 * A bar cut with live tools: the outer surface (radius by angle and Z) and the face surface (height
 * by X/Y), each drawn only where the other one leaves material. The fragment shaders read the other
 * map from a texture and discard what is outside it, so a tooth gap milled in the face opens the
 * side of the bar, and the face map's square corners vanish outside the round bar.
 */
function LiveToolBar({ moves, index, stock, zero, ballTools, radialTools, color }: Props) {
  const key = useMemo(() => ({ moves, stock, zero, ballTools, radialTools }), [moves, stock, zero, ballTools, radialTools])
  const { model, version } = replayTo(
    key,
    () => createBarModel(stock, zero),
    copyBarModel,
    (b: BarModel, m: Move) => cutBar(b, m, radialTools?.has(m.state.tool) ?? false, ballTools.has(m.state.tool)),
    moves,
    index
  )
  const parts = useMemo(() => liveBarParts(createBarModel(stock, zero)), [stock, zero])
  useEffect(() => () => disposeLiveBar(parts), [parts])

  const shown = useRef<{ model: BarModel; color: string } | null>(null)
  useEffect(() => {
    // A new model (new stock, checkpoint restore) is drawn whole, the same one only where it changed
    const full = shown.current?.model !== model || shown.current.color !== color
    shown.current = { model, color }
    drawLiveBar(parts, model, color, full)
  }, [parts, model, version, color])

  return (
    <>
      <mesh geometry={parts.outer} material={parts.outerMaterial} />
      <mesh geometry={parts.face} material={parts.faceMaterial} />
    </>
  )
}

