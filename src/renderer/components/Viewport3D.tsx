import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { CameraControls, GizmoHelper, GizmoViewcube, Grid, Html, Line, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import type CameraControlsImpl from 'camera-controls'
import { Box3, BufferAttribute, Sphere, BufferGeometry, ExtrudeGeometry, LatheGeometry, Shape, Vector2, Vector3, type Group } from 'three'
import {
  chuckGeometry,
  stockOrigin,
  holderOutline,
  insertOutline,
  toolOutline,
  workShift,
  type Holder,
  type Machine,
  type Move,
  type Outline,
  type SimulationResult,
  type Stock as StockData,
  type Tool,
  type ToolMount,
  type Vec3,
  type WorkOffsets
} from '@core/index'
import { Machining } from './Machining'
import { useI18n } from '../i18n'
import { latheToolAngle, viewAngles, viewDirection, type ViewKind } from '../views'

interface Props {
  machine: Machine
  /** Raw material from the project (or the machine's default), null for none. */
  stock: StockData | null
  /** Work offset table: the stock sits on its offset and each set offset gets a marker. */
  workOffsets: WorkOffsets
  result: SimulationResult | null
  /** Move being executed; everything up to it is drawn as done. */
  index: number
  /** Tool tip position in world coordinates. */
  toolTip: Vec3 | null
  toolRadius: number
  /** Tool in the spindle (from the project tools), its holder and how it is mounted. */
  tool: Tool | undefined
  holder: Holder | undefined
  mount: ToolMount
  /** The holder touches the stock at this move (possible collision). */
  colliding: boolean
  /** Lathe: draw as on the machine, the chuck and part turning in C and the tool fixed in X/Z. */
  machineView: boolean
  /** Current C angle in radians (lathe). */
  spindleAngle: number
  /** Main spindle speed as drawn, radians per second (0: stopped); the chuck turns at it in machine view. */
  spinRate: number
  showRapids: boolean
  showStock: boolean
  /** Show the stock being cut (heightfield on mills, turned profile on lathes). */
  machining: boolean
  /** Tools with a ball end. */
  ballTools: Set<number>
  /** The tool may hit the chuck at this move: the jaws turn red. */
  chuckHit: boolean
  /** Camera preset to go to; `n` changes on every request, so the same view can be asked again. */
  view: { kind: ViewKind; n: number }
  /** Keep the tool in the middle of the view while it moves. */
  follow: boolean
  /** Measuring session (0: off): clicks pick two points and show the distance between them. */
  measuring: number
  /** Orthographic camera, as CAD programs use by default (false: perspective). */
  ortho: boolean
  /** Show the stock as the whole program leaves it (the finished part), wherever playback is. */
  finished: boolean
  /** Moves of the operation picked in the feature tree, drawn highlighted. */
  highlight: { first: number; last: number } | null
}

export type { ViewKind } from '../views'

/** Machine coordinates to the scene: mills draw machine Z up (scene Y). */
const toScene = (p: Vec3, lathe: boolean): Vec3 => (lathe ? p : [p[0], p[2], -p[1]])

/** Camera far from the part on its view line: the orthographic view zooms instead of moving closer. */
const CAMERA_DISTANCE = 3000
const scaled = ([x, y, z]: [number, number, number], k: number): Vec3 => [x * k, y * k, z * k]

/**
 * Turns the camera to a standard view and fits the part, with a short transition (camera-controls
 * leaves no spin behind, so Top and Front end up exactly flat). Follow keeps the tool in the middle.
 */
function CameraRig({ view, lathe, box, follow, tip }: { view: { kind: ViewKind; n: number }; lathe: boolean; box: Box3 | null; follow: boolean; tip: Vec3 | null }) {
  const controls = useThree((s) => s.controls) as unknown as CameraControlsImpl | null
  /** The part has been framed once: a new path (an edit) does not move the camera again. */
  const fitted = useRef(false)
  const apply = useEffectEvent((animate: boolean) => {
    if (!controls || !box) return
    if (view.kind !== 'fit') {
      const { azimuth, polar } = viewAngles(view.kind, lathe)
      void controls.rotateTo(azimuth, polar, animate)
    }
    // fitToBox would snap the angle to the nearest cube face (an isometric view would turn into a side view)
    void controls.fitToSphere(box.getBoundingSphere(new Sphere()), animate)
    fitted.current = true
  })
  // A view asked for (toolbar, menu); a new camera (perspective or orthographic); the first part shown
  useEffect(() => apply(true), [view, controls])
  useEffect(() => {
    if (!fitted.current) apply(true)
  }, [box])
  useFrame(() => {
    if (follow && tip && controls) void controls.moveTo(tip[0], tip[1], tip[2], false)
  })
  return null
}

const fmt3 = (v: number) => (Math.abs(v) < 5e-7 ? 0 : v).toFixed(3)

/** The two measured points, the line between them and the distance, in the drawing frame. */
function Measure({ points, lathe, size }: { points: Vec3[]; lathe: boolean; size: number }) {
  const [a, b] = points
  const r = Math.max(0.4, size * 0.012)
  const label = (p: Vec3) => (lathe ? `X${fmt3(p[0] * 2)} Z${fmt3(p[2])}` : `X${fmt3(p[0])} Y${fmt3(p[1])} Z${fmt3(p[2])}`)
  return (
    <>
      {points.map((p, k) => (
        <group key={k} position={p}>
          <mesh>
            <sphereGeometry args={[r, 16, 12]} />
            <meshBasicMaterial color="#ffe14d" depthTest={false} />
          </mesh>
          <Html className="measure-label" center={false} style={{ transform: 'translate(8px, -8px)' }}>
            P{k + 1} {label(p)}
          </Html>
        </group>
      ))}
      {a && b && (
        <>
          <Line points={[a, b]} color="#ffe14d" lineWidth={2} depthTest={false} />
          <Html className="measure-label total" position={[(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]} center>
            <b>{fmt3(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]))} mm</b>
            <span>
              {lathe
                ? `ΔX(Ø) ${fmt3((b[0] - a[0]) * 2)} ΔZ ${fmt3(b[2] - a[2])}`
                : `ΔX ${fmt3(b[0] - a[0])} ΔY ${fmt3(b[1] - a[1])} ΔZ ${fmt3(b[2] - a[2])}`}
            </span>
          </Html>
        </>
      )}
    </>
  )
}

/** Nearest path vertex within `tol` of p (so a click on a line lands on its corner), else p itself. */
function snap(p: Vec3, layers: Layer[], tol: number): Vec3 {
  let best = tol * tol
  let out = p
  for (const l of layers) {
    const v = l.positions
    for (let i = 0; i < v.length; i += 3) {
      const dx = (v[i] ?? 0) - p[0]
      const dy = (v[i + 1] ?? 0) - p[1]
      const dz = (v[i + 2] ?? 0) - p[2]
      const d = dx * dx + dy * dy + dz * dz
      if (d < best) {
        best = d
        out = [v[i] ?? 0, v[i + 1] ?? 0, v[i + 2] ?? 0]
      }
    }
  }
  return out
}

const COLORS = {
  feed: '#5ea4f2',
  center: '#f0b43a',
  rapid: '#f06b50',
  tool: '#3fd19c',
  stock: '#9aa6b1',
  cutter: '#d7dee5',
  holder: '#7d8894',
  collision: '#ff4d40',
  highlight: '#ffffff',
  chuck: '#4b545e',
  jaw: '#8c96a1'
}

const isLathe = (m: Machine) => m.kinematics.startsWith('lathe')

/** All segments of one layer in a single buffer; starts[k] = vertices before move k. */
interface Layer {
  positions: Float32Array
  starts: Int32Array
}

function buildLayer(moves: Move[], pick: (m: Move) => readonly Vec3[] | undefined): Layer {
  let count = 0
  for (const m of moves) {
    const p = pick(m)
    if (p && p.length > 1) count += (p.length - 1) * 2
  }
  const positions = new Float32Array(count * 3)
  const starts = new Int32Array(moves.length + 1)
  let v = 0
  moves.forEach((m, k) => {
    starts[k] = v
    const p = pick(m)
    if (!p) return
    for (let i = 0; i + 1 < p.length; i++) {
      for (const q of [p[i] as Vec3, p[i + 1] as Vec3]) {
        positions.set(q, v * 3)
        v++
      }
    }
  })
  starts[moves.length] = v
  return { positions, starts }
}

function PathLayer({ layer, color, done, ghostOpacity }: { layer: Layer; color: string; done: number; ghostOpacity: number }) {
  // Ghost (path still to run) and done part share one vertex buffer: uploaded to the GPU once, not twice.
  // Built here and disposed by hand, so a new program frees the old path's GPU memory.
  const geometries = useMemo(() => {
    const position = new BufferAttribute(layer.positions, 3)
    const make = () => new BufferGeometry().setAttribute('position', position)
    return { ghost: make(), done: make() }
  }, [layer])
  useEffect(
    () => () => {
      geometries.ghost.dispose()
      geometries.done.dispose()
    },
    [geometries]
  )
  if (!layer.positions.length) return null
  return (
    <>
      {/* Ghost: only the part still to run (the done part is drawn solid over it), so each segment is drawn once */}
      <lineSegments frustumCulled={false} geometry={geometries.ghost} geometry-drawRange-start={done}>
        <lineBasicMaterial color={color} transparent opacity={ghostOpacity} depthWrite={false} />
      </lineSegments>
      <lineSegments frustumCulled={false} geometry={geometries.done} geometry-drawRange-count={done}>
        <lineBasicMaterial color={color} />
      </lineSegments>
    </>
  )
}

/** Scene position of a work offset's zero (the drawing frame is G54). Lathe: on the spindle axis. */
function zeroOf(offsets: WorkOffsets, name: string, lathe: boolean): Vec3 {
  const s = workShift(offsets, name)
  return lathe ? [0, 0, s.Z] : [s.X, s.Y, s.Z]
}

function WorkZero({ at, name, size }: { at: Vec3; name: string; size: number }) {
  return (
    <group position={at}>
      <axesHelper args={[size]} />
      <Html position={[size * 0.15, size * 0.15, 0]} className="zero-label" zIndexRange={[10, 0]}>
        {name}
      </Html>
    </group>
  )
}

function Stock({ stock: s, faded, zero }: { stock: StockData; faded: boolean; zero: Vec3 }) {
  // Keyed: three does not recompile a material when `transparent` flips, so the faded stock would stay opaque
  const material = (
    <meshStandardMaterial key={faded ? 'faded' : 'solid'} color={s.color ?? COLORS.stock} metalness={0.5} roughness={0.4} transparent={faded} opacity={faded ? 0.22 : 1} depthWrite={!faded} />
  )
  const o: Vec3 = [zero[0] + (s.offset?.X ?? 0), zero[1] + (s.offset?.Y ?? 0), zero[2] + (s.offset?.Z ?? 0)]
  if (s.shape === 'cylinder') {
    const r = (s.diameter ?? 50) / 2
    const len = s.length ?? 30
    // Face at Z0, body toward negative Z (into the chuck)
    return (
      <mesh position={[o[0], o[1], o[2] - len / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r, r, len, 96]} />
        {material}
      </mesh>
    )
  }
  const x = s.x ?? 100
  const y = s.y ?? 80
  const z = s.z ?? 30
  return (
    <mesh position={[o[0] + x / 2, o[1] + y / 2, o[2] - z / 2]}>
      <boxGeometry args={[x, y, z]} />
      {material}
    </mesh>
  )
}

/** Solid of revolution around +Y (three.js LatheGeometry); the parent rotates it onto the tool axis. */
function Revolved({ outline, color, opacity = 1 }: { outline: Outline; color: string; opacity?: number }) {
  const geometry = useMemo(() => new LatheGeometry(outline.map(([r, h]) => new Vector2(Math.max(r, 0), h)), 40), [outline])
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} metalness={0.6} roughness={0.35} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  )
}

/** Rotary tool with its holder (mill taper or lathe driven holder), drawn from the tip up. */
function RotaryTool({ tool, holder, colliding, spindleNose }: { tool: Tool; holder: Holder | undefined; colliding: boolean; spindleNose: boolean }) {
  const body = useMemo(() => toolOutline(tool), [tool])
  const nose = useMemo(() => (holder ? holderOutline(holder, tool.length) : null), [holder, tool.length])
  const top = nose?.[nose.length - 1]?.[1] ?? tool.length
  return (
    <>
      <Revolved outline={body} color={COLORS.cutter} />
      {nose && <Revolved outline={nose} color={colliding ? COLORS.collision : COLORS.holder} />}
      {/* Mill spindle nose above the taper, faded: only for reference */}
      {spindleNose && (
        <mesh position={[0, top + 20, 0]}>
          <cylinderGeometry args={[45, 45, 40, 48]} />
          <meshStandardMaterial color={COLORS.chuck} transparent opacity={0.25} depthWrite={false} />
        </mesh>
      )}
    </>
  )
}

/**
 * Turning tool in the X/Z plane: the ISO insert at the tip (its shape, hand and side from the tool),
 * with a square shank out along +X for external tools or a round boring bar along +Z for internal ones.
 */
function TurningTool({ tool }: { tool: Tool }) {
  const outline = useMemo(() => insertOutline(tool), [tool])
  const insert = useMemo(() => {
    const s = new Shape()
    outline.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)))
    s.closePath()
    return new ExtrudeGeometry(s, { depth: 4, bevelEnabled: false })
  }, [outline])
  const internal = tool.side === 'internal'
  const zSign = tool.hand === 'left' ? -1 : 1
  const shank = Math.max(tool.length, 30)
  return (
    // Shape x → X, shape y → Z (rotating +90° about X turns the drawing plane into X/Z)
    <group rotation={[Math.PI / 2, 0, 0]}>
      <mesh geometry={insert} position={[0, 0, -2]}>
        <meshStandardMaterial color="#e3b23c" metalness={0.5} roughness={0.4} />
      </mesh>
      {internal ? (
        <mesh position={[-8, (zSign * shank) / 2 + zSign * 6, 0]}>
          <cylinderGeometry args={[7, 7, shank, 32]} />
          <meshStandardMaterial color={COLORS.holder} metalness={0.5} roughness={0.4} />
        </mesh>
      ) : (
        <mesh position={[shank / 2 + 8, zSign * 8, 0]}>
          <boxGeometry args={[shank, 16, 16]} />
          <meshStandardMaterial color={COLORS.holder} metalness={0.5} roughness={0.4} />
        </mesh>
      )}
    </group>
  )
}

/** Three-jaw chuck: the body behind the chuck face and three stepped jaws holding the end of the bar. */
function Chuck({ stock, zero, hit }: { stock: StockData; zero: Vec3; hit: boolean }) {
  const c = chuckGeometry(stock, zero)
  const jaw = c.jawOuter - c.barRadius
  const jawColor = hit ? COLORS.collision : COLORS.jaw
  // Drawn a hair away from the bar: the bar's end on the chuck face and the jaws on the bar's surface
  // were in the same planes, and the screen flickered between them as the view turned
  const GAP = 0.6
  const grip = jaw * 0.6 - GAP / 2
  return (
    <group>
      <mesh position={[0, 0, c.face - 25 - GAP]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[c.bodyRadius, c.bodyRadius, 50, 72]} />
        <meshStandardMaterial color={COLORS.chuck} metalness={0.55} roughness={0.35} />
      </mesh>
      {[90, 210, 330].map((deg) => {
        const a = (deg * Math.PI) / 180
        return (
          <group key={deg} rotation={[0, 0, a]}>
            {/* Gripping step on the bar, and the base step bolted to the chuck face */}
            <mesh position={[c.barRadius + GAP / 2 + grip / 2, 0, c.face + c.grip / 2]}>
              <boxGeometry args={[grip, 16, c.grip]} />
              <meshStandardMaterial color={jawColor} metalness={0.6} roughness={0.35} />
            </mesh>
            <mesh position={[c.barRadius + jaw * 0.8, 0, c.face + c.grip * 0.3]}>
              <boxGeometry args={[jaw * 0.4, 20, c.grip * 0.6]} />
              <meshStandardMaterial color={jawColor} metalness={0.6} roughness={0.35} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

/** Turns its children around the spindle axis at `rate` radians per second (0: stopped). */
function Spin({ rate, children }: { rate: number; children: ReactNode }) {
  const ref = useRef<Group>(null)
  useFrame((_s, dt) => {
    if (rate > 0 && ref.current) ref.current.rotation.z -= dt * rate
  })
  return <group ref={ref}>{children}</group>
}

const rotateZ = (p: Vec3, a: number): Vec3 => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a), p[2]]

export function Viewport3D({
  machine,
  stock,
  workOffsets,
  result,
  index,
  toolTip,
  toolRadius,
  tool,
  holder,
  mount,
  colliding,
  machineView,
  spindleAngle,
  spinRate,
  showRapids,
  showStock,
  machining,
  ballTools,
  chuckHit,
  view,
  follow,
  measuring,
  ortho,
  finished,
  highlight
}: Props) {
  const { t } = useI18n()
  const lathe = isLathe(machine)
  const size = lathe ? (stock?.diameter ?? 60) : Math.max(stock?.x ?? 100, stock?.y ?? 80)
  // Lathe: far enough to see the chuck and a driven holder (about 150 mm over the tip) together
  const dist = lathe ? Math.max(size * 2.6, 190) : size * 1.6

  const layers = useMemo(() => {
    const moves = result?.moves ?? []
    return {
      feed: buildLayer(moves, (m) => (m.kind === 'feed' ? m.points : undefined)),
      center: buildLayer(moves, (m) => (m.kind === 'feed' ? m.toolCenter : undefined)),
      rapid: buildLayer(moves, (m) => (m.kind === 'rapid' ? m.points : undefined))
    }
  }, [result])
  const doneOf = (l: Layer) => l.starts[index + 1] ?? 0
  // Middle and size of the cutting path (rapids to the tool change would make the part tiny), where the quick views aim
  const bounds = useMemo(() => {
    const lo = [Infinity, Infinity, Infinity]
    const hi = [-Infinity, -Infinity, -Infinity]
    const moves = result?.moves ?? []
    const cuts = moves.some((m) => m.kind === 'feed') ? moves.filter((m) => m.kind === 'feed') : moves
    for (const m of cuts)
      for (const q of m.points)
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k] ?? 0, q[k] ?? 0)
          hi[k] = Math.max(hi[k] ?? 0, q[k] ?? 0)
        }
    // The whole stock is in the picture too, not only the path
    if (stock) {
      const o = stockOrigin(stock, zeroOf(workOffsets, stock.workOffset ?? 'G54', lathe))
      const r = (stock.diameter ?? 0) / 2
      const corners: Vec3[] = lathe
        ? [[-r, -r, o[2]], [r, r, o[2] - (stock.length ?? 0)]]
        : [o, [o[0] + (stock.x ?? 0), o[1] + (stock.y ?? 0), o[2] - (stock.z ?? 0)]]
      for (const q of corners)
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k] ?? 0, q[k] ?? 0)
          hi[k] = Math.max(hi[k] ?? 0, q[k] ?? 0)
        }
    }
    if (!Number.isFinite(lo[0])) return null
    // Lathe: the path is on one side of the spindle axis, the part is round: frame both sides
    if (lathe)
      for (const k of [0, 1]) {
        const r = Math.max(Math.abs(lo[k] ?? 0), Math.abs(hi[k] ?? 0))
        lo[k] = -r
        hi[k] = r
      }
    // In scene coordinates: mills draw machine Z up
    const a = toScene([lo[0] ?? 0, lo[1] ?? 0, lo[2] ?? 0], lathe)
    const b = toScene([hi[0] ?? 0, hi[1] ?? 0, hi[2] ?? 0], lathe)
    const box = new Box3().setFromPoints([new Vector3(...a), new Vector3(...b)])
    // A program with almost no moves still gets a view the size of the stock
    if (box.getSize(new Vector3()).length() < size) box.expandByScalar(size / 2)
    return box
  }, [result, lathe, size, stock, workOffsets])
  // The operation picked in the feature tree, drawn bright over the path
  const highlighted = useMemo(
    () => (highlight && result ? buildLayer(result.moves.slice(highlight.first, highlight.last + 1), (m) => m.points) : null),
    [highlight, result]
  )
  const [picks, setPicks] = useState<{ session: number; points: Vec3[] }>({ session: 0, points: [] })
  const measured = measuring && picks.session === measuring ? picks.points : []
  const part = useRef<Group>(null)
  /** Measuring: a click (not a drag) on the part, stock or path picks a point; a third click starts over. */
  function pick(e: ThreeEvent<MouseEvent>) {
    if (!measuring || e.delta > 4 || !part.current) return
    e.stopPropagation()
    const local = part.current.worldToLocal(e.point.clone())
    // Snaps to the cutting path only: rapids above the part would pull a click on its face up to the clearance plane
    const p = snap([local.x, local.y, local.z], [layers.feed], Math.max(0.5, size * 0.03))
    setPicks((prev) => ({ session: measuring, points: prev.session === measuring && prev.points.length < 2 ? [...prev.points, p] : [p] }))
  }
  const toolLength = Math.max(20, size * 0.4)
  // Machine view (lathe): everything on the spindle turns by -C, so the tool stays in the X/Z plane
  const turn = lathe && machineView ? -spindleAngle : 0
  const tip = toolTip ? rotateZ(toolTip, turn) : null
  /** Radial tools point at the spindle axis from where the tip is. */
  const radialAngle = tip ? latheToolAngle(tip) : 0
  // Memoized: the machining view keys its cut model on this array, and a new array on every
  // playback frame made it throw the cut stock away and replay the whole program each frame.
  const stockOffset = stock ? (stock.workOffset ?? 'G54') : null
  const stockZero = useMemo<Vec3>(() => (stockOffset ? zeroOf(workOffsets, stockOffset, lathe) : [0, 0, 0]), [workOffsets, stockOffset, lathe])
  const faded = !!result?.moves.length
  // Removal is drawn on block stock (mills) and bars (lathes); other combinations keep the raw stock
  const cutting = machining && showStock && !!stock && !!result?.moves.length && (lathe ? stock.shape === 'cylinder' : stock.shape === 'block')

  let toolModel: ReactNode = null
  if (tip && tool) {
    if (mount === 'turning')
      toolModel = (
        <group position={tip} rotation={[0, 0, radialAngle]}>
          <TurningTool tool={tool} />
        </group>
      )
    else
      toolModel = (
        // LatheGeometry runs along +Y: axial → +Z (mill spindle, lathe face), radial → outward from the axis
        <group position={tip} rotation={mount === 'radial' ? [0, 0, radialAngle - Math.PI / 2] : [Math.PI / 2, 0, 0]}>
          <RotaryTool tool={tool} holder={holder} colliding={colliding} spindleNose={!lathe} />
        </group>
      )
  } else if (tip) {
    // No tool data (T word without a library entry): a plain cylinder of the compensation radius
    toolModel = (
      <mesh position={[tip[0], tip[1], tip[2] + toolLength / 2]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[Math.max(0.5, toolRadius), Math.max(0.5, toolRadius), toolLength, 32]} />
        <meshStandardMaterial color={COLORS.tool} transparent opacity={0.75} />
      </mesh>
    )
  }

  return (
    <Canvas dpr={[1, 2]}>
      {/* CAD-like orthographic view by default; the camera stays far away and zooms */}
      {ortho ? (
        <OrthographicCamera makeDefault position={scaled(viewDirection(viewAngles('iso', lathe)), CAMERA_DISTANCE)} near={1} far={CAMERA_DISTANCE * 4} zoom={4} />
      ) : (
        <PerspectiveCamera makeDefault position={scaled(viewDirection(viewAngles('iso', lathe)), dist * 1.6)} fov={40} near={0.5} far={20000} />
      )}
      <color attach="background" args={['#0e1215']} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[120, 200, 160]} intensity={1.1} />
      <directionalLight position={[-150, -60, -120]} intensity={0.35} />
      {/* Machine coordinates. Lathe: Z = spindle axis (scene Z). Mill: machine Z is up (scene Y). */}
      <group rotation={lathe ? [0, 0, 0] : [-Math.PI / 2, 0, 0]} onClick={measuring ? pick : undefined}>
        {/* Part side: stock, chuck, path and zeros turn together with the spindle in machine view */}
        <group ref={part} rotation={[0, 0, turn]}>
          <Spin rate={lathe && machineView ? spinRate : 0}>
            {showStock && stock && (cutting && lathe ? null : <Stock stock={stock} faded={faded} zero={stockZero} />)}
            {cutting && <Machining moves={result.moves} index={finished ? result.moves.length - 1 : index} stock={stock} zero={stockZero} lathe={lathe} ballTools={ballTools} color={stock.color ?? COLORS.stock} />}
            {lathe && showStock && stock?.shape === 'cylinder' && <Chuck stock={stock} zero={stockZero} hit={chuckHit} />}
          </Spin>
          {Object.keys(workOffsets)
            .filter((n) => n !== 'G54')
            .map((n) => (
              <WorkZero key={n} name={n} at={zeroOf(workOffsets, n, lathe)} size={size * 0.25} />
            ))}
          <PathLayer layer={layers.feed} color={COLORS.feed} done={doneOf(layers.feed)} ghostOpacity={0.2} />
          <PathLayer layer={layers.center} color={COLORS.center} done={doneOf(layers.center)} ghostOpacity={0.2} />
          {showRapids && <PathLayer layer={layers.rapid} color={COLORS.rapid} done={doneOf(layers.rapid)} ghostOpacity={0.12} />}
          {highlighted && (
            <lineSegments frustumCulled={false} renderOrder={2}>
              <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[highlighted.positions, 3]} />
              </bufferGeometry>
              <lineBasicMaterial color={COLORS.highlight} depthTest={false} transparent opacity={0.95} />
            </lineSegments>
          )}
          {measured.length > 0 && <Measure points={measured} lathe={lathe} size={size} />}
        </group>
        {toolModel}
        <axesHelper args={[size * 0.75]} />
      </group>
      <Grid
        position={[0, lathe ? -size / 2 - 5 : -(stock?.z ?? 30) - 0.01, 0]}
        args={[1000, 1000]}
        cellSize={5}
        sectionSize={50}
        cellColor="#1f2930"
        sectionColor="#33424d"
        fadeDistance={size * 8}
        infiniteGrid
      />
      <CameraControls makeDefault smoothTime={0.25} />
      <CameraRig view={view} lathe={lathe} box={bounds} follow={follow} tip={tip ? toScene(tip, lathe) : null} />
      {/* View cube, as in CAD programs: click a face, an edge or a corner to look from there */}
      <GizmoHelper alignment="top-right" margin={[72, 72]}>
        <GizmoViewcube
          faces={[t('cube.right'), t('cube.left'), t('cube.top'), t('cube.bottom'), t('cube.front'), t('cube.back')]}
          color="#26303a"
          textColor="#e2e7eb"
          strokeColor="#6fd3ff"
          hoverColor="#f0a51e"
          opacity={0.92}
        />
      </GizmoHelper>
    </Canvas>
  )
}

export const PATH_COLORS = COLORS
