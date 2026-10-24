import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { GizmoHelper, GizmoViewport, Grid, Html, OrbitControls } from '@react-three/drei'
import { BufferAttribute, BufferGeometry, ExtrudeGeometry, LatheGeometry, Shape, Vector2, type Group } from 'three'
import {
  chuckGeometry,
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
  /** Main spindle turning (turning, not live tooling): the chuck spins while playing. */
  spinning: boolean
  showRapids: boolean
  showStock: boolean
  /** Show the stock being cut (heightfield on mills, turned profile on lathes). */
  machining: boolean
  /** Tools with a ball end. */
  ballTools: Set<number>
  /** The tool may hit the chuck at this move: the jaws turn red. */
  chuckHit: boolean
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
  const material = (
    <meshStandardMaterial color={s.color ?? COLORS.stock} metalness={0.5} roughness={0.4} transparent={faded} opacity={faded ? 0.22 : 1} depthWrite={!faded} />
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
  return (
    <group>
      <mesh position={[0, 0, c.face - 25]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[c.bodyRadius, c.bodyRadius, 50, 72]} />
        <meshStandardMaterial color={COLORS.chuck} metalness={0.55} roughness={0.35} />
      </mesh>
      {[90, 210, 330].map((deg) => {
        const a = (deg * Math.PI) / 180
        return (
          <group key={deg} rotation={[0, 0, a]}>
            {/* Gripping step on the bar, and the base step bolted to the chuck face */}
            <mesh position={[c.barRadius + jaw * 0.3, 0, c.face + c.grip / 2]}>
              <boxGeometry args={[jaw * 0.6, 16, c.grip]} />
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

/** Turns its children around Z while `on` (spindle running): a visual cue, not the real speed. */
function Spin({ on, children }: { on: boolean; children: ReactNode }) {
  const ref = useRef<Group>(null)
  useFrame((_s, dt) => {
    if (on && ref.current) ref.current.rotation.z -= dt * 6
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
  spinning,
  showRapids,
  showStock,
  machining,
  ballTools,
  chuckHit
}: Props) {
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
  const toolLength = Math.max(20, size * 0.4)
  // Machine view (lathe): everything on the spindle turns by -C, so the tool stays in the X/Z plane
  const turn = lathe && machineView ? -spindleAngle : 0
  const tip = toolTip ? rotateZ(toolTip, turn) : null
  /** Radial tools point at the spindle axis from where the tip is. */
  const radialAngle = tip ? Math.atan2(tip[1], tip[0]) : 0
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
    <Canvas camera={{ position: lathe ? [dist * 0.85, dist * 0.55, dist * 0.8] : [dist, dist, dist], fov: 40, near: 0.5, far: 20000 }} dpr={[1, 2]}>
      <color attach="background" args={['#0e1215']} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[120, 200, 160]} intensity={1.1} />
      <directionalLight position={[-150, -60, -120]} intensity={0.35} />
      {/* Machine coordinates. Lathe: Z = spindle axis (scene Z). Mill: machine Z is up (scene Y). */}
      <group rotation={lathe ? [0, 0, 0] : [-Math.PI / 2, 0, 0]}>
        {/* Part side: stock, chuck, path and zeros turn together with the spindle in machine view */}
        <group rotation={[0, 0, turn]}>
          <Spin on={spinning && lathe && machineView}>
            {showStock && stock && (cutting && lathe ? null : <Stock stock={stock} faded={faded} zero={stockZero} />)}
            {cutting && <Machining moves={result.moves} index={index} stock={stock} zero={stockZero} lathe={lathe} ballTools={ballTools} color={stock.color ?? COLORS.stock} />}
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
      <OrbitControls makeDefault enableDamping />
      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport labelColor="white" axisHeadScale={0.9} />
      </GizmoHelper>
    </Canvas>
  )
}

export const PATH_COLORS = COLORS
