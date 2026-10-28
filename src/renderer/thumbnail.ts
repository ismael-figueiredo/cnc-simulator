// Small pictures of the finished part, for the start screen and the document tree: the stock is
// machined with every move of the program and drawn once, off screen, as an isometric view.
import { AmbientLight, Box3, BufferAttribute, BufferGeometry, Color, DirectionalLight, Group, Mesh, MeshStandardMaterial, OrthographicCamera, Scene, Sphere, Vector3, WebGLRenderer } from 'three'
import { createBarModel, createHeightfield, createProfile, cutBar, cutHeightfield, cutProfile, hasLiveCuts, type Heightfield, type Move, type Stock, type Vec3 } from '@core/index'
import { disposeLiveBar, drawLiveBar, liveBarParts } from './geometry/liveBar'
import { barGeometry } from './geometry/machined'
import { storage } from './platform/storage'

export interface PartSource {
  moves: readonly Move[]
  stock: Stock
  /** Scene position of the stock's work zero (as the 3D view places it). */
  zero: Vec3
  lathe: boolean
  ballTools: ReadonlySet<number>
  /** Lathe live tools that cut the side of the bar (the others cut its face). */
  radialTools?: ReadonlySet<number>
}

const WIDTH = 320
const HEIGHT = 200
/** Programs longer than this are not drawn: cutting them all at once would hold the window up. */
const MAX_MOVES = 150_000
const CUT = '#bfe6ff'

let renderer: WebGLRenderer | null = null
function getRenderer(): WebGLRenderer | null {
  if (renderer) return renderer
  try {
    renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true })
    renderer.setPixelRatio(2)
    renderer.setSize(WIDTH, HEIGHT, false)
  } catch {
    renderer = null
  }
  return renderer
}

/** Machined block: the top surface over the heightfield and the four walls down to the bottom. */
function blockGeometry(h: Heightfield, color: string): BufferGeometry {
  const pos: number[] = []
  const col: number[] = []
  const raw = new Color(color)
  const cut = new Color(color).lerp(new Color(CUT), 0.55)
  const x = (i: number) => h.x0 + i * h.cell
  const y = (j: number) => h.y0 + j * h.cell
  const z = (i: number, j: number) => h.heights[j * h.nx + i] ?? h.top
  const tint = (zz: number) => (zz < h.top - 1e-3 ? cut : raw)
  const quad = (a: Vec3, b: Vec3, c: Vec3, d: Vec3, ca: Color, cb: Color, cc: Color, cd: Color) => {
    pos.push(...a, ...b, ...c, ...a, ...c, ...d)
    for (const k of [ca, cb, cc, ca, cc, cd]) col.push(k.r, k.g, k.b)
  }
  for (let j = 0; j + 1 < h.ny; j++)
    for (let i = 0; i + 1 < h.nx; i++) {
      const a: Vec3 = [x(i), y(j), z(i, j)]
      const b: Vec3 = [x(i + 1), y(j), z(i + 1, j)]
      const c: Vec3 = [x(i + 1), y(j + 1), z(i + 1, j + 1)]
      const d: Vec3 = [x(i), y(j + 1), z(i, j + 1)]
      quad(a, b, c, d, tint(a[2]), tint(b[2]), tint(c[2]), tint(d[2]))
    }
  // Walls: along each border, from the surface down to the bottom
  const wall = (pts: [number, number][]) => {
    for (let k = 0; k + 1 < pts.length; k++) {
      const [i0, j0] = pts[k] as [number, number]
      const [i1, j1] = pts[k + 1] as [number, number]
      quad([x(i0), y(j0), h.bottom], [x(i1), y(j1), h.bottom], [x(i1), y(j1), z(i1, j1)], [x(i0), y(j0), z(i0, j0)], raw, raw, tint(z(i1, j1)), tint(z(i0, j0)))
    }
  }
  const row = (j: number, rev = false) => {
    const p = Array.from({ length: h.nx }, (_, i) => [i, j] as [number, number])
    return rev ? p.reverse() : p
  }
  const column = (i: number, rev = false) => {
    const p = Array.from({ length: h.ny }, (_, j) => [i, j] as [number, number])
    return rev ? p.reverse() : p
  }
  wall(row(0))
  wall(column(h.nx - 1))
  wall(row(h.ny - 1, true))
  wall(column(0, true))
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3))
  g.computeVertexNormals()
  return g
}

/** The finished part as a PNG data URL, or null when it cannot be drawn (no WebGL, no stock, too long). */
export function renderPart(src: PartSource): string | null {
  if (!src.moves.length || src.moves.length > MAX_MOVES) return null
  const gl = getRenderer()
  if (!gl) return null
  const color = src.stock.color ?? '#9aa6b1'
  const part = new Group()
  /** Freed once the picture is taken. */
  const disposables: { dispose: () => void }[] = []
  if (src.lathe && src.stock.shape === 'cylinder' && hasLiveCuts(src.moves)) {
    // Live tooling cuts more than a turned shape: the same two-map bar as the 3D view
    const radial = src.radialTools ?? new Set<number>()
    const b = createBarModel(src.stock, src.zero)
    for (const m of src.moves) cutBar(b, m, radial.has(m.state.tool), src.ballTools.has(m.state.tool))
    const parts = liveBarParts(b)
    drawLiveBar(parts, b, color, true)
    const bar = new Group()
    bar.add(new Mesh(parts.outer, parts.outerMaterial), new Mesh(parts.face, parts.faceMaterial))
    // The spindle axis (Z) across the picture, face to the right, as the turned bars
    bar.rotation.y = Math.PI / 2
    part.add(bar)
    disposables.push({ dispose: () => disposeLiveBar(parts) })
  } else if (src.lathe) {
    if (src.stock.shape !== 'cylinder') return null
    const p = createProfile(src.stock, src.zero)
    for (const m of src.moves) cutProfile(p, m)
    const geometry = barGeometry(p, color)
    disposables.push(geometry)
    const mesh = new Mesh(geometry, new MeshStandardMaterial({ vertexColors: true, metalness: 0.5, roughness: 0.4 }))
    // LatheGeometry turns around +Y; lay the spindle axis across the picture
    mesh.rotation.z = -Math.PI / 2
    part.add(mesh)
  } else {
    if (src.stock.shape !== 'block') return null
    const h = createHeightfield(src.stock, src.zero)
    for (const m of src.moves) cutHeightfield(h, m, src.ballTools.has(m.state.tool))
    const geometry = blockGeometry(h, color)
    disposables.push(geometry)
    const mesh = new Mesh(geometry, new MeshStandardMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.45 }))
    // Machine Z up
    mesh.rotation.x = -Math.PI / 2
    part.add(mesh)
  }
  const scene = new Scene()
  scene.add(part, new AmbientLight(0xffffff, 0.6))
  const key = new DirectionalLight(0xffffff, 1.2)
  key.position.set(1, 2, 1.5)
  const fill = new DirectionalLight(0xffffff, 0.35)
  fill.position.set(-1.5, -0.5, -1)
  scene.add(key, fill)
  part.updateMatrixWorld(true)
  const sphere = new Box3().setFromObject(part).getBoundingSphere(new Sphere())
  const r = Math.max(1, sphere.radius)
  const aspect = WIDTH / HEIGHT
  const camera = new OrthographicCamera(-r * aspect, r * aspect, r, -r, 0.1, r * 20)
  const dir = new Vector3(1, 0.85, 1.15).normalize()
  camera.position.copy(sphere.center).addScaledVector(dir, r * 6)
  camera.lookAt(sphere.center)
  // The bounding sphere is wider than the part seen from a corner: zoom in to fill the picture
  camera.zoom = 1.65
  camera.updateProjectionMatrix()
  gl.setClearColor(0x000000, 0)
  gl.render(scene, camera)
  const url = gl.domElement.toDataURL('image/png')
  for (const d of disposables) d.dispose()
  return url
}

// Bumped when the drawing changes (2: turned bars faced inward before; 3: live tool cuts drawn), so
// old pictures are redrawn
const PREFIX = 'cncsim.thumb3.'
/** Short stable key for a part: same program, machine and stock give the same picture. */
export function thumbKey(...parts: string[]): string {
  let h = 2166136261
  for (const ch of parts.join('|')) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}
export const readThumb = (key: string): string | null => storage.get(PREFIX + key)
// When the storage is full the picture is just drawn again next time
export const writeThumb = (key: string, url: string): void => storage.set(PREFIX + key, url)
