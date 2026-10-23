import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { GizmoHelper, GizmoViewport, Grid, Html, OrbitControls } from '@react-three/drei'
import { workShift, type Machine, type Move, type SimulationResult, type Stock as StockData, type Vec3, type WorkOffsets } from '@core/index'

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
  showRapids: boolean
  showStock: boolean
}

const COLORS = { feed: '#5ea4f2', center: '#f0b43a', rapid: '#f06b50', tool: '#3fd19c', stock: '#9aa6b1' }

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
  if (!layer.positions.length) return null
  return (
    <>
      <lineSegments frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[layer.positions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={color} transparent opacity={ghostOpacity} depthWrite={false} />
      </lineSegments>
      <lineSegments frustumCulled={false}>
        <bufferGeometry drawRange-count={done}>
          <bufferAttribute attach="attributes-position" args={[layer.positions, 3]} />
        </bufferGeometry>
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

export function Viewport3D({ machine, stock, workOffsets, result, index, toolTip, toolRadius, showRapids, showStock }: Props) {
  const lathe = isLathe(machine)
  const size = lathe ? (stock?.diameter ?? 60) : Math.max(stock?.x ?? 100, stock?.y ?? 80)
  const dist = size * 1.6

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

  return (
    <Canvas camera={{ position: lathe ? [dist, dist * 0.7, dist * 0.9] : [dist, dist, dist], fov: 40, near: 0.5, far: 20000 }} dpr={[1, 2]}>
      <color attach="background" args={['#0e1215']} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[120, 200, 160]} intensity={1.1} />
      <directionalLight position={[-150, -60, -120]} intensity={0.35} />
      {/* Machine coordinates. Lathe: Z = spindle axis (scene Z). Mill: machine Z is up (scene Y). */}
      <group rotation={lathe ? [0, 0, 0] : [-Math.PI / 2, 0, 0]}>
        {showStock && stock && <Stock stock={stock} faded={!!result?.moves.length} zero={zeroOf(workOffsets, stock.workOffset ?? 'G54', lathe)} />}
        {Object.keys(workOffsets)
          .filter((n) => n !== 'G54')
          .map((n) => (
            <WorkZero key={n} name={n} at={zeroOf(workOffsets, n, lathe)} size={size * 0.25} />
          ))}
        <PathLayer layer={layers.feed} color={COLORS.feed} done={doneOf(layers.feed)} ghostOpacity={0.2} />
        <PathLayer layer={layers.center} color={COLORS.center} done={doneOf(layers.center)} ghostOpacity={0.2} />
        {showRapids && <PathLayer layer={layers.rapid} color={COLORS.rapid} done={doneOf(layers.rapid)} ghostOpacity={0.12} />}
        {toolTip && (
          <mesh position={[toolTip[0], toolTip[1], toolTip[2] + toolLength / 2]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[Math.max(0.5, toolRadius), Math.max(0.5, toolRadius), toolLength, 32]} />
            <meshStandardMaterial color={COLORS.tool} transparent opacity={0.75} />
          </mesh>
        )}
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
