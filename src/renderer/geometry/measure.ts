// What the measure tool snaps to: the features of the part as cut up to the current move, from the
// same removal models the 3D view draws (replayed in a cache of their own).
import {
  copyBarModel,
  createBarModel,
  createHeightfield,
  createProfile,
  cutBar,
  cutHeightfield,
  cutProfile,
  hasLiveCuts,
  heightfieldFeatures,
  holeFeatures,
  holesOf,
  mergeFeatures,
  NO_FEATURES,
  snapToFeatures,
  turnedFeatures,
  turnedOutline,
  type BarModel,
  type Features,
  type Heightfield,
  type Move,
  type Snap,
  type Stock,
  type TurnProfile,
  type Vec3
} from '@core/index'
import { copyHeightfield, copyProfile, replayTo } from './machined'

export interface MeasurePart {
  moves: readonly Move[]
  /** Moves up to this one (inclusive) have cut the stock; -1 for the raw stock. */
  index: number
  stock: Stock
  /** Scene position of the stock's work zero. */
  zero: Vec3
  lathe: boolean
  ballTools: ReadonlySet<number>
  radialTools: ReadonlySet<number>
}

/** The cut part's features near p: the model is replayed up to the current move on the first call. */
export function featuresNear(key: object, part: MeasurePart, p: Vec3, reach: number): Features {
  const { moves, index, stock, zero, lathe, ballTools, radialTools } = part
  const list = moves as Move[]
  if (!lathe) {
    const h = replayTo(key, () => createHeightfield(stock, zero), copyHeightfield, (m: Heightfield, mv: Move) => cutHeightfield(m, mv, ballTools.has(mv.state.tool)), list, index).model
    const holes = holesOf(moves).filter((hole) => hole.last <= index)
    return mergeFeatures(heightfieldFeatures(h, p, reach), holeFeatures(holes, (x, y) => heightAt(h, x, y)))
  }
  if (hasLiveCuts(moves)) {
    const b = replayTo(key, () => createBarModel(stock, zero), copyBarModel, (m: BarModel, mv: Move) => cutBar(m, mv, radialTools.has(mv.state.tool), ballTools.has(mv.state.tool)), list, index).model
    return mergeFeatures(turnedFeatures(turnedOutline(sliceAt(b, Math.atan2(p[1], p[0])), b.face, b.cell), p), heightfieldFeatures(b.faceMap, p, reach))
  }
  const profile = replayTo(key, () => createProfile(stock, zero), copyProfile, (m: TurnProfile, mv: Move) => cutProfile(m, mv), list, index).model
  return turnedFeatures(turnedOutline(profile.radii, profile.face, profile.cell), p)
}

/** Where a measuring click at p lands: a feature of the part, a path point, or p itself. */
export function snapMeasure(key: object, part: MeasurePart | null, p: Vec3, tol: number, path: readonly Vec3[]): Snap {
  const features = part ? featuresNear(key, part, p, tol * 2) : NO_FEATURES
  return snapToFeatures(p, features, tol, path)
}

const heightAt = (h: Heightfield, x: number, y: number) => {
  const i = Math.min(h.nx - 1, Math.max(0, Math.round((x - h.x0) / h.cell)))
  const j = Math.min(h.ny - 1, Math.max(0, Math.round((y - h.y0) / h.cell)))
  return h.heights[j * h.nx + i] ?? h.top
}

/** The bar's outer radius along Z at one angle (its column nearest to `angle`). */
function sliceAt(b: BarModel, angle: number): Float32Array {
  const step = (2 * Math.PI) / b.nTheta
  const c = ((Math.round(angle / step) % b.nTheta) + b.nTheta) % b.nTheta
  const out = new Float32Array(b.nz)
  for (let i = 0; i < b.nz; i++) out[i] = b.radii[i * b.nTheta + c] ?? b.radius
  return out
}

/** The path's points as a list, for snapping to where the tool went. */
export function pathPoints(positions: Float32Array): Vec3[] {
  const out: Vec3[] = []
  for (let i = 0; i + 2 < positions.length; i += 3) out.push([positions[i] ?? 0, positions[i + 1] ?? 0, positions[i + 2] ?? 0])
  return out
}

/**
 * Lathe: points measured on the profile, whatever side of the bar they were clicked on. Each one is
 * turned around the axis onto the half-plane of the first, so the distance is taken in (radius, Z).
 */
export function onProfile(points: readonly Vec3[]): Vec3[] {
  const first = points[0]
  if (!first) return []
  const a = Math.atan2(first[1], first[0])
  return points.map((p) => {
    const r = Math.hypot(p[0], p[1])
    return [r * Math.cos(a), r * Math.sin(a), p[2]]
  })
}
