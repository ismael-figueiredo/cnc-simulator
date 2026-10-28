// The bar cut with live tools, as three.js meshes: the outer surface (radius by angle and Z) and the
// face map (height by X/Y), each clipped in its fragment shader to where the other one leaves
// material. Used by the 3D view while playing and by the part pictures.
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DataTexture,
  FloatType,
  MeshStandardMaterial,
  NearestFilter,
  RedFormat,
  Sphere,
  Vector3,
  Vector4,
  type WebGLProgramParametersWithUniforms
} from 'three'
import { takeDirty, takeDirtyRows, type BarModel, type Vec3 } from '@core/index'
import { cutColor, gridGeometry, writeCells } from './machined'

export type LiveBarParts = ReturnType<typeof liveBarParts>

/** Geometries, textures and materials for a bar of this size (its model's shape, not its cuts). */
export function liveBarParts(b: BarModel) {
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
    // Both materials share onBeforeCompile's source: without a key of their own three.js would
    // compile one program for both, and the face would be clipped as the outer surface is
    m.customProgramCacheKey = () => discard
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
}

/** Writes the model into the parts: all of it, or only the rows and cells cut since the last time. */
export function drawLiveBar(parts: LiveBarParts, model: BarModel, color: string, full: boolean): void {
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
}

export function disposeLiveBar(parts: LiveBarParts): void {
  for (const d of [parts.faceTex, parts.radialTex, parts.outer, parts.face, parts.outerMaterial, parts.faceMaterial]) d.dispose()
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
