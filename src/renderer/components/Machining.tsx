import { useEffect, useMemo, useRef } from 'react'
import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  FloatType,
  MeshStandardMaterial,
  NearestFilter,
  RedFormat,
  Sphere,
  Uint32BufferAttribute,
  Vector3,
  Vector4,
  type WebGLProgramParametersWithUniforms
} from 'three'
import {
  takeDirty,
  takeDirtyRows,
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
import { barGeometry, copyHeightfield, copyProfile, cutColor, holeGeometry, replayTo, seatHole, writeCells } from '../geometry/machined'

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
function gridGeometry(h: Heightfield) {
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
  const parts = useMemo(() => {
    const b = createBarModel(stock, zero)
    const h = b.faceMap
    const faceTex = new DataTexture(new Float32Array(h.nx * h.ny), h.nx, h.ny, RedFormat, FloatType)
    const radialTex = new DataTexture(new Float32Array(b.nTheta * b.nz), b.nTheta, b.nz, RedFormat, FloatType)
    for (const t of [faceTex, radialTex]) t.minFilter = t.magFilter = NearestFilter
    const uniforms = {
      uFace: { value: faceTex },
      uFaceGrid: { value: new Vector4(h.x0, h.y0, h.cell, h.top) },
      uRadial: { value: radialTex },
      uRadialGrid: { value: new Vector4(b.face, b.cell, b.nTheta, b.nz) }
    }
    const material = (discard: string) => {
      const m = new MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.4, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
      m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
        Object.assign(shader.uniforms, uniforms)
        shader.vertexShader = 'varying vec3 vPart;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vPart = position;')
        shader.fragmentShader = BAR_MAPS_GLSL + shader.fragmentShader.replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n  ' + discard)
      }
      return m
    }
    return {
      faceTex,
      radialTex,
      outer: barSurfaceGeometry(b),
      face: gridGeometry(h),
      // A hair of tolerance, so surfaces exactly on the other map's boundary stay drawn
      outerMaterial: material('if (vPart.z > faceAt(vPart.xy) + 0.01) discard;'),
      faceMaterial: material('if (vPart.z > uFaceGrid.w - 0.001 || length(vPart.xy) > radiusAt(vPart) + 0.01) discard;')
    }
  }, [stock, zero])
  useEffect(
    () => () => {
      for (const d of [parts.faceTex, parts.radialTex, parts.outer, parts.face, parts.outerMaterial, parts.faceMaterial]) d.dispose()
    },
    [parts]
  )

  const shown = useRef<{ model: BarModel; color: string } | null>(null)
  useEffect(() => {
    const full = shown.current?.model !== model || shown.current.color !== color
    shown.current = { model, color }
    const rows = takeDirtyRows(model)
    const cells = takeDirty(model.faceMap)
    const h = model.faceMap
    if (full || rows) {
      writeBarRows(parts.outer, model, full ? [0, model.nz - 1] : (rows ?? [0, 0]), color)
      upload(parts.radialTex, model.radii)
    }
    if (full || cells) {
      writeCells(parts.face, h, full ? [0, 0, h.nx - 1, h.ny - 1] : (cells ?? [0, 0, 0, 0]), color)
      upload(parts.faceTex, h.heights)
    }
  }, [parts, model, version, color])

  return (
    <>
      <mesh geometry={parts.outer} material={parts.outerMaterial} />
      <mesh geometry={parts.face} material={parts.faceMaterial} />
    </>
  )
}

/** Copies a map into its texture and sends it to the GPU on the next frame. */
function upload(texture: DataTexture, data: Float32Array) {
  ;(texture.image.data as Float32Array).set(data)
  texture.needsUpdate = true
}

/** The two maps read in the fragment shader (bilinear, by hand: float textures need not filter). */
const BAR_MAPS_GLSL = `varying vec3 vPart;
uniform sampler2D uFace;
uniform vec4 uFaceGrid;
uniform sampler2D uRadial;
uniform vec4 uRadialGrid;
float faceAt(vec2 p) {
  vec2 size = vec2(textureSize(uFace, 0));
  vec2 g = clamp((p - uFaceGrid.xy) / uFaceGrid.z, vec2(0.0), size - 1.001);
  ivec2 i = ivec2(floor(g));
  vec2 f = g - vec2(i);
  float a = texelFetch(uFace, i, 0).r;
  float b = texelFetch(uFace, i + ivec2(1, 0), 0).r;
  float c = texelFetch(uFace, i + ivec2(0, 1), 0).r;
  float d = texelFetch(uFace, i + ivec2(1, 1), 0).r;
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float radiusAt(vec3 p) {
  float n = uRadialGrid.z;
  float u = atan(p.y, p.x) / 6.28318530718 * n;
  if (u < 0.0) u += n;
  float v = clamp((uRadialGrid.x - p.z) / uRadialGrid.y, 0.0, uRadialGrid.w - 1.001);
  int i0 = int(floor(u)) % int(n);
  int i1 = (i0 + 1) % int(n);
  int j = int(floor(v));
  float fu = fract(u);
  float fv = v - float(j);
  float a = texelFetch(uRadial, ivec2(i0, j), 0).r;
  float b = texelFetch(uRadial, ivec2(i1, j), 0).r;
  float c = texelFetch(uRadial, ivec2(i0, j + 1), 0).r;
  float d = texelFetch(uRadial, ivec2(i1, j + 1), 0).r;
  return mix(mix(a, b, fu), mix(c, d, fu), fv);
}
`

/**
 * The outer surface of the bar: one vertex per angle and row, plus a row on the axis at the face and
 * at the back end that closes it (the face disc is drawn by those caps where the face map is uncut).
 */
function barSurfaceGeometry(b: BarModel) {
  const rows = b.nz + 2
  const n = b.nTheta * rows
  const g = new BufferGeometry()
  for (const name of ['position', 'normal', 'color']) g.setAttribute(name, new BufferAttribute(new Float32Array(n * 3), 3))
  g.boundingSphere = new Sphere(new Vector3(0, 0, b.face - (b.nz * b.cell) / 2), Math.hypot(b.radius, (b.nz * b.cell) / 2) + 1)
  // Outward faces: rows run toward the chuck (−Z), columns counterclockwise
  const idx = new Uint32Array(b.nTheta * (rows - 1) * 6)
  let o = 0
  for (let j = 0; j + 1 < rows; j++)
    for (let c = 0; c < b.nTheta; c++) {
      const a = j * b.nTheta + c
      const bb = j * b.nTheta + ((c + 1) % b.nTheta)
      const cc = a + b.nTheta
      const d = bb + b.nTheta
      idx.set([a, cc, bb, bb, cc, d], o)
      o += 6
    }
  g.setIndex(new BufferAttribute(idx, 1))
  return g
}

/** Writes the mesh rows that show model rows r0…r1 (and their neighbors, for the normals). */
function writeBarRows(g: BufferGeometry, b: BarModel, [r0, r1]: readonly [number, number], color: string) {
  const pos = g.getAttribute('position') as BufferAttribute
  const nor = g.getAttribute('normal') as BufferAttribute
  const col = g.getAttribute('color') as BufferAttribute
  const rows = b.nz + 2
  const raw = new Color(color)
  const cut = cutColor(color)
  const step = (2 * Math.PI) / b.nTheta
  // Mesh row j shows model row j − 1; rows 0 and rows − 1 are the caps on the axis
  const ja = Math.max(0, r0)
  const jb = Math.min(rows - 1, r1 + 2)
  const zOf = (j: number) => b.face - Math.min(Math.max(j - 1, 0), b.nz - 1) * b.cell
  for (let j = Math.max(0, ja - 1); j <= Math.min(rows - 1, jb + 1); j++)
    for (let c = 0; c < b.nTheta; c++) {
      const r = j === 0 || j === rows - 1 ? 0 : (b.radii[(j - 1) * b.nTheta + c] ?? b.radius)
      pos.setXYZ(j * b.nTheta + c, r * Math.cos(c * step), r * Math.sin(c * step), zOf(j))
    }
  const p = (j: number, c: number) => {
    const k = Math.min(rows - 1, Math.max(0, j)) * b.nTheta + ((c + b.nTheta) % b.nTheta)
    return [pos.getX(k), pos.getY(k), pos.getZ(k)] as Vec3
  }
  for (let j = ja; j <= jb; j++)
    for (let c = 0; c < b.nTheta; c++) {
      // Along the angle and toward the face: their cross product points out of the material
      const [ax, ay, az] = p(j, c + 1)
      const [bx, by, bz] = p(j, c - 1)
      const [cx, cy, cz] = p(j - 1, c)
      const [dx, dy, dz] = p(j + 1, c)
      const [tx, ty, tz] = [ax - bx, ay - by, az - bz]
      const [ux, uy, uz] = [cx - dx, cy - dy, cz - dz]
      let nx = ty * uz - tz * uy
      let ny = tz * ux - tx * uz
      let nz = tx * uy - ty * ux
      const len = Math.hypot(nx, ny, nz)
      if (len < 1e-9) [nx, ny, nz] = [0, 0, j < rows / 2 ? 1 : -1]
      else [nx, ny, nz] = [nx / len, ny / len, nz / len]
      const k = j * b.nTheta + c
      nor.setXYZ(k, nx, ny, nz)
      const r = j === 0 || j === rows - 1 ? b.radius : (b.radii[(j - 1) * b.nTheta + c] ?? b.radius)
      const shade = r < b.radius - 1e-3 ? cut : raw
      col.setXYZ(k, shade.r, shade.g, shade.b)
    }
  const start = Math.max(0, ja - 1) * b.nTheta * 3
  const count = (Math.min(rows - 1, jb + 1) - Math.max(0, ja - 1) + 1) * b.nTheta * 3
  for (const a of [pos, nor, col]) {
    a.clearUpdateRanges()
    a.addUpdateRange(start, count)
    a.needsUpdate = true
  }
}
