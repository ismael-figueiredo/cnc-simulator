// What holds the part: the lathe chuck and the machining center table with its vise. Modeled from
// reference photos (hydraulic three-jaw chuck, cast iron T-slot table), sized from the machine JSON.
import { useEffect, useMemo } from 'react'
import { BoxGeometry, BufferGeometry, CylinderGeometry, ExtrudeGeometry, Matrix4, RingGeometry, Shape } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { JAW_BASE, type ChuckGeometry, type TableLayout } from '@core/index'

const COLORS = {
  body: '#7a8590',
  flange: '#56606a',
  jaw: '#a7b1bb',
  master: '#86919b',
  hole: '#15191d',
  collision: '#ff4d40',
  table: '#737e88',
  dowel: '#9aa4ad',
  vise: '#3f7396',
  visePlate: '#a9b3bc'
}

/** The chuck stands this far from the bar: faces in the same plane flickered as the view turned. */
const GAP = 0.6

/** Disposes geometries built in a memo when they are replaced or unmounted. */
function useDispose(...geometries: BufferGeometry[]) {
  useEffect(() => () => geometries.forEach((g) => g.dispose()), geometries) // eslint-disable-line react-hooks/exhaustive-deps
}

/** A box spanning [x0, x1] × [y0, y1] × [z0, z1]. */
function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  return new BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
}

/** A flat disc on a plane facing +Z (bolt heads and holes seen from the front). */
function disc(x: number, y: number, z: number, r: number) {
  return new CylinderGeometry(r, r, 0.4, 20).rotateX(Math.PI / 2).translate(x, y, z)
}

/** Copies of a geometry turned around Z, one per jaw. */
function around(g: BufferGeometry, count: number, start: number) {
  return Array.from({ length: count }, (_, k) => g.clone().rotateZ(start + (k * 2 * Math.PI) / count))
}

/**
 * Hydraulic chuck: the body (chamfered, with the spindle bore) on a square flange, a radial slot and
 * master jaw per jaw, and the stepped hard jaws bolted on them, gripping the bar.
 */
export function ChuckModel({ chuck: c, hit }: { chuck: ChuckGeometry; hit: boolean }) {
  const parts = useMemo(() => {
    const Rb = c.bodyRadius
    const L = c.bodyLength
    const ch = Math.min(6, Rb * 0.05)
    // Body: chamfered front, a step at the back; separate surfaces keep the edges sharp in the shading
    const back = L * 0.82
    const tube = (r0: number, r1: number, z0: number, z1: number) =>
      new CylinderGeometry(r1, r0, z1 - z0, 96, 1, true).rotateX(Math.PI / 2).translate(0, 0, (z0 + z1) / 2)
    const ring = (r0: number, r1: number, z: number, facing: 1 | -1) => {
      const g = new RingGeometry(r0, r1, 96)
      return (facing < 0 ? g.rotateX(Math.PI) : g).translate(0, 0, z)
    }
    const body = mergeGeometries([
      ring(c.boreRadius, Rb - ch, 0, 1),
      tube(Rb, Rb - ch, -ch, 0),
      tube(Rb, Rb, -back, -ch),
      ring(Rb * 0.96, Rb, -back, -1),
      tube(Rb * 0.96, Rb * 0.96, -L, -back)
    ])
    const flangeSide = Rb * 1.55
    const flange = mergeGeometries([
      box(-flangeSide / 2, flangeSide / 2, -flangeSide / 2, flangeSide / 2, -L - 16, -L),
      new CylinderGeometry(Rb * 0.6, Rb * 0.6, 60, 48).rotateX(Math.PI / 2).translate(0, 0, -L - 46)
    ])

    // Radial slots and face bolts (dark), on the face between the jaws
    const w = c.jawWidth
    const slot = box(c.boreRadius + 3, Rb - ch - 3, -w * 0.55, w * 0.55, -0.4, 0.15)
    const holes: BufferGeometry[] = [...around(slot, c.jaws, Math.PI / 2), ring(0, c.boreRadius, -4, 1)]
    for (let k = 0; k < c.jaws; k++) {
      const a = Math.PI / 2 + ((k + 0.5) * 2 * Math.PI) / c.jaws
      for (const r of [Rb * 0.8, c.boreRadius + (Rb - c.boreRadius) * 0.3])
        holes.push(disc(Math.cos(a) * r, Math.sin(a) * r, 0.3, Math.max(3, Rb * 0.035)))
    }

    // Master jaw in its slot, out past the hard jaw, with the serrations the hard jaw locks into
    const outer = Math.min(c.jawOuter + 14, Rb - ch - 4)
    const masterParts = [box(c.barRadius + c.jawOuter * 0.2, outer, -w * 0.45, w * 0.45, -0.2, 5)]
    for (let r = c.jawOuter + 2; r < outer - 1; r += 3) masterParts.push(box(r, r + 1.4, -w * 0.45, w * 0.45, 5, 6.2))
    const master = mergeGeometries(around(mergeGeometries(masterParts), c.jaws, Math.PI / 2))

    // Stepped hard jaw: the gripping step on the bar, then the lower outer step with its two bolts
    const r0 = c.barRadius + GAP / 2
    const zb = c.grip * JAW_BASE
    const shape = new Shape()
    shape.moveTo(r0, 0)
    shape.lineTo(r0, c.grip)
    shape.lineTo(c.jawStep, c.grip)
    shape.lineTo(c.jawStep, zb)
    shape.lineTo(c.jawOuter, zb)
    shape.lineTo(c.jawOuter, 0)
    shape.closePath()
    // Shape (radius, axial) extruded across the jaw width: shape Y → axial (Z), extrusion → -Y
    const jaw = new ExtrudeGeometry(shape, { depth: w, bevelEnabled: true, bevelSize: 0.6, bevelThickness: 0.6, bevelSegments: 1, curveSegments: 1 })
      .rotateX(Math.PI / 2)
      .translate(0, w / 2, 0)
    const jaws = mergeGeometries(around(jaw, c.jaws, Math.PI / 2))
    const boltR = Math.min(5, w * 0.17)
    const bolts = mergeGeometries(
      around(
        mergeGeometries([0.3, 0.75].map((f) => disc(c.jawStep + (c.jawOuter - c.jawStep) * f, 0, zb + 0.5, boltR))),
        c.jaws,
        Math.PI / 2
      )
    )
    return { body, flange, holes: mergeGeometries(holes), master, jaws, bolts }
  }, [c])
  useDispose(parts.body, parts.flange, parts.holes, parts.master, parts.jaws, parts.bolts)

  const jawColor = hit ? COLORS.collision : COLORS.jaw
  return (
    <group position={[0, 0, c.face]}>
      {/* Body and everything on its face stand a hair behind the bar's end */}
      <group position={[0, 0, -GAP]}>
        <mesh geometry={parts.body}>
          <meshStandardMaterial color={COLORS.body} metalness={0.3} roughness={0.45} />
        </mesh>
        <mesh geometry={parts.flange}>
          <meshStandardMaterial color={COLORS.flange} metalness={0.3} roughness={0.55} />
        </mesh>
        <mesh geometry={parts.holes}>
          <meshStandardMaterial color={COLORS.hole} metalness={0.2} roughness={0.8} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
        </mesh>
        <mesh geometry={parts.master}>
          <meshStandardMaterial color={COLORS.master} metalness={0.35} roughness={0.4} />
        </mesh>
      </group>
      <mesh geometry={parts.jaws}>
        <meshStandardMaterial color={jawColor} metalness={0.35} roughness={0.4} />
      </mesh>
      <mesh geometry={parts.bolts}>
        <meshStandardMaterial color={COLORS.hole} metalness={0.3} roughness={0.7} />
      </mesh>
    </group>
  )
}

/** Extrusion along X of a profile drawn in (Y, Z): X ← extrusion, Y ← shape X, Z ← shape Y. */
const ALONG_X = new Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1)

/**
 * Machining center table (machine coordinates, Z up): a cast iron slab with its T-slots along X and
 * dowel holes at the ends, and the vise holding the stock when there is one.
 */
export function TableModel({ layout: t }: { layout: TableLayout }) {
  const parts = useMemo(() => {
    const W = t.width
    const sw = t.slotWidth
    // Cross-section with the T-slots: neck as wide as the slot, head under it
    const shape = new Shape()
    shape.moveTo(-W / 2, -t.height)
    shape.lineTo(W / 2, -t.height)
    shape.lineTo(W / 2, 0)
    for (const y of [...t.slots].sort((a, b) => b - a)) {
      const neck = sw * 0.9
      const head = sw * 0.75
      shape.lineTo(y + sw / 2, 0)
      shape.lineTo(y + sw / 2, -neck)
      shape.lineTo(y + sw * 0.9, -neck)
      shape.lineTo(y + sw * 0.9, -neck - head)
      shape.lineTo(y - sw * 0.9, -neck - head)
      shape.lineTo(y - sw * 0.9, -neck)
      shape.lineTo(y - sw / 2, -neck)
      shape.lineTo(y - sw / 2, 0)
    }
    shape.lineTo(-W / 2, 0)
    shape.closePath()
    const slab = new ExtrudeGeometry(shape, { depth: t.length, bevelEnabled: false }).applyMatrix4(ALONG_X).translate(-t.length / 2, 0, 0)

    // Dowel and tapped holes in the lands between the slots, near both ends
    const edges = [-W / 2, ...t.slots, W / 2].sort((a, b) => a - b)
    const dowels: BufferGeometry[] = []
    for (let k = 1; k < edges.length - 2; k++) {
      const y = ((edges[k] ?? 0) + (edges[k + 1] ?? 0)) / 2
      for (const x of [-t.length / 2 + 35, t.length / 2 - 35]) dowels.push(disc(x, y, 0.25, Math.min(7, sw * 0.35)))
    }
    return { slab, dowels: dowels.length ? mergeGeometries(dowels) : null }
  }, [t])
  useDispose(parts.slab, ...(parts.dowels ? [parts.dowels] : []))

  return (
    <group>
      <group position={[t.center[0], t.center[1], t.top - GAP]}>
        <mesh geometry={parts.slab}>
          <meshStandardMaterial color={COLORS.table} metalness={0.35} roughness={0.6} />
        </mesh>
        {parts.dowels && (
          <mesh geometry={parts.dowels}>
            <meshStandardMaterial color={COLORS.dowel} metalness={0.7} roughness={0.3} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
          </mesh>
        )}
      </group>
      {t.vise && <Vise vise={t.vise} />}
    </group>
  )
}

/** Machine vise: body on the table, fixed jaw at the back (+Y), moving jaw and screw at the front. */
function Vise({ vise: v }: { vise: NonNullable<TableLayout['vise']> }) {
  const parts = useMemo(() => {
    const [x0, x1] = v.x
    const [y0, y1] = v.y
    const jaw = 32
    const plate = 6
    const front = y0 - GAP - plate - jaw
    const back = y1 + GAP + plate + jaw
    // The screw and its square end stick out at the front, halfway up the moving jaw
    const mid = v.base + (v.jawTop - v.base) * 0.45
    const cx = (x0 + x1) / 2
    const body = mergeGeometries([
      // Bed the stock rests on, fixed jaw block, moving jaw riding on the bed
      box(x0, x1, front - 40, back, v.base, v.seat - GAP),
      box(x0, x1, y1 + GAP + plate, back, v.seat, v.jawTop),
      box(x0, x1, front, y0 - GAP - plate, v.seat - 0.01, v.jawTop),
      new CylinderGeometry(9, 9, 70, 24).translate(cx, front - 75, mid),
      box(cx - 11, cx + 11, front - 132, front - 110, mid - 11, mid + 11)
    ])
    // Hardened jaw plates on both sides of the stock
    const plates = mergeGeometries([box(x0 + 2, x1 - 2, y0 - GAP - plate, y0 - GAP, v.seat + 0.5, v.jawTop), box(x0 + 2, x1 - 2, y1 + GAP, y1 + GAP + plate, v.seat + 0.5, v.jawTop)])
    return { body, plates }
  }, [v])
  useDispose(parts.body, parts.plates)
  return (
    <group>
      <mesh geometry={parts.body}>
        <meshStandardMaterial color={COLORS.vise} metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh geometry={parts.plates}>
        <meshStandardMaterial color={COLORS.visePlate} metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  )
}
