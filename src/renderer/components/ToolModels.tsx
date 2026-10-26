// Tools in 3D, modeled from catalog photos: rotary tools (end mills, drills, face mills) with their
// taper holders, and lathe tools (ISO insert in its holder head, laydown thread inserts, boring bars,
// grooving blades). Everything is built in code from the tool's type and sizes.
import { useEffect, useMemo } from 'react'
import { Line } from '@react-three/drei'
import { BoxGeometry, BufferGeometry, CylinderGeometry, ExtrudeGeometry, Shape, Vector2 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { holderDrawing, holderOutline, insertOutline, toolOutline, type Holder, type Outline, type Tool, type Vec3 } from '@core/index'
import { sharpLathe } from './sharpLathe'

const COLORS = {
  carbide: '#a3adb7',
  shank: '#d7dee5',
  flute: '#3a424b',
  holder: '#a2adb8',
  insert: '#e3b23c',
  screw: '#3a4148',
  collision: '#ff4d40',
  spindle: '#4b545e'
}

/** Merges boxes and cylinders (indexed) with extrusions (not indexed): all made non-indexed first. */
const merge = (list: BufferGeometry[]) => mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)))

/** Disposes geometries built in a memo when they are replaced or unmounted. */
function useDispose(...geometries: (BufferGeometry | null)[]) {
  useEffect(() => () => geometries.forEach((g) => g?.dispose()), geometries) // eslint-disable-line react-hooks/exhaustive-deps
}

function Revolved({ outline, color, metalness = 0.2, roughness = 0.45 }: { outline: Outline; color: string; metalness?: number; roughness?: number }) {
  const geometry = useMemo(() => sharpLathe(outline.map(([r, h]) => new Vector2(Math.max(r, 0), h)), 48), [outline])
  useDispose(geometry)
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} />
    </mesh>
  )
}

/** A face mill: a body with inserts around it, not flutes (a short cutting length on a wide tool). */
const isFaceMill = (tool: Tool) => tool.type === 'flat-endmill' && tool.diameter >= 32 && (tool.fluteLength ?? tool.length) < tool.diameter * 0.3

/** Helical lines along the flutes, one per flute (drawing only, in the tool's frame: +Y up from the tip). */
function fluteLines(tool: Tool, from: number, to: number): Vec3[][] {
  const R = tool.diameter / 2
  const n = Math.max(1, tool.flutes ?? 2)
  // 30° helix (drills and taps steeper looking, 25°): one turn every 2πR / tan(helix)
  const helix = ((tool.type === 'drill' ? 28 : tool.type === 'tap' ? 10 : 30) * Math.PI) / 180
  const lead = (2 * Math.PI * R) / Math.tan(helix)
  const steps = Math.max(8, Math.ceil(((to - from) / lead) * 24))
  return Array.from({ length: n }, (_, k) =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const h = from + ((to - from) * i) / steps
      const a = (k / n) * 2 * Math.PI + ((h - from) / lead) * 2 * Math.PI
      return [Math.sin(a) * R * 1.01, h, Math.cos(a) * R * 1.01] as Vec3
    })
  )
}

/** Rotary tool with its holder (mill taper or lathe driven holder), drawn from the tip up (+Y). */
export function RotaryTool({ tool, holder, colliding, spindleNose }: { tool: Tool; holder: Holder | undefined; colliding: boolean; spindleNose: boolean }) {
  const parts = useMemo(() => {
    const outline = toolOutline(tool)
    // Cutting part (up to the end of the flutes, closed on the axis) and the shank above it
    const k = outline.findIndex(([, h], i) => i > 0 && h >= (tool.fluteLength ?? tool.length * 0.45) - 1e-9)
    const cut = k > 0 ? outline.slice(0, k + 1) : outline
    const top = cut[cut.length - 1]?.[1] ?? 0
    const shank = k > 0 ? ([[0, top], ...outline.slice(k + 1)] as Outline) : null
    return { cut: [...cut, [0, top]] as Outline, shank, top }
  }, [tool])
  const nose = useMemo(() => (holder ? holderDrawing(holder, tool.length) : null), [holder, tool.length])
  // The spindle face: the flange's top, where the taper goes into the spindle
  const gauge = holder ? (holderOutline(holder, tool.length).at(-1)?.[1] ?? tool.length) : tool.length
  const faceMill = isFaceMill(tool)
  const lines = useMemo(() => {
    if (faceMill || tool.type === 'chamfer-mill' || tool.diameter < 1) return []
    const from = tool.type === 'drill' ? tool.diameter * 0.3 : tool.type === 'ball-endmill' ? tool.diameter / 2 : 0
    return fluteLines(tool, from, parts.top)
  }, [tool, faceMill, parts.top])
  const inserts = useMemo(() => {
    if (!faceMill) return null
    const R = tool.diameter / 2
    const n = Math.max(3, tool.flutes ?? 5)
    const s = Math.min(10, R * 0.35)
    return mergeGeometries(
      Array.from({ length: n }, (_, k) =>
        new BoxGeometry(s * 0.35, s, s)
          .translate(R - s * 0.35, s / 2, 0)
          .rotateY((k / n) * 2 * Math.PI)
      )
    )
  }, [faceMill, tool])
  useDispose(inserts)

  return (
    <>
      <Revolved outline={parts.cut} color={faceMill ? COLORS.holder : COLORS.carbide} metalness={0.25} roughness={0.35} />
      {parts.shank && <Revolved outline={parts.shank} color={COLORS.shank} />}
      {inserts && (
        <mesh geometry={inserts}>
          <meshStandardMaterial color={COLORS.insert} metalness={0.5} roughness={0.4} />
        </mesh>
      )}
      {lines.map((pts, k) => (
        <Line key={k} points={pts} color={COLORS.flute} lineWidth={1.5} />
      ))}
      {nose && <Revolved outline={nose} color={colliding ? COLORS.collision : COLORS.holder} metalness={0.2} roughness={0.5} />}
      {/* Mill spindle nose above the taper, faded: only for reference */}
      {spindleNose && (
        <mesh position={[0, gauge + 50, 0]}>
          <cylinderGeometry args={[45, 45, 100, 48]} />
          <meshStandardMaterial color={COLORS.spindle} transparent opacity={0.25} depthWrite={false} />
        </mesh>
      )}
    </>
  )
}

/** A slab with this outline in the X/Z plane (outline x → X, y → Z), from y0 up to y1. */
function slab(outline: readonly [number, number][], y0: number, y1: number) {
  const s = new Shape()
  outline.forEach(([x, z], i) => (i ? s.lineTo(x, z) : s.moveTo(x, z)))
  s.closePath()
  // Extruded along shape Z; turning +90° about X takes shape Y to scene Z and the extrusion to −Y
  return new ExtrudeGeometry(s, { depth: y1 - y0, bevelEnabled: false }).rotateX(Math.PI / 2).translate(0, y1, 0)
}

/** A box spanning [x0, x1] × [y0, y1] × [z0, z1]. */
function box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  return new BoxGeometry(x1 - x0, y1 - y0, z1 - z0).translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
}

/** Convex hull (counterclockwise) of a set of points: the holder head around the insert and shank. */
function hull(points: [number, number][]): [number, number][] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (list: [number, number][]) => {
    const h: [number, number][] = []
    for (const q of list) {
      while (h.length >= 2 && cross(h[h.length - 2] as [number, number], h[h.length - 1] as [number, number], q) <= 0) h.pop()
      h.push(q)
    }
    h.pop()
    return h
  }
  return [...half(p), ...half([...p].reverse())]
}

/** Insert thickness (ISO 04, 4.76 mm) and holder sizes, in mm. */
const INSERT_T = 4.76
const SHANK = 20
const BAR = 16

/**
 * Turning tool at the tip, in the lathe's X/Z plane (+Y up, the insert's rake face at the tip's
 * height): the ISO insert and its clamp screw on a holder head, then a square shank out along +X
 * (external tools), a round bar along +Z (boring and internal threading) or a blade (grooving).
 * Built for a right-hand external tool and mirrored for internal (X) and left-hand (Z) ones.
 */
export function TurningTool({ tool }: { tool: Tool }) {
  const internal = tool.side === 'internal'
  const parts = useMemo(() => {
    const base: Tool = { ...tool, side: 'external', hand: 'right' }
    const thread = tool.type === 'threading'
    const grooving = tool.type === 'grooving'
    const outline = insertOutline(base, thread ? 16 : 12)
    const insert = slab(outline, -INSERT_T, 0)
    const cx = outline.reduce((s, [x]) => s + x, 0) / outline.length
    const cz = outline.reduce((s, [, z]) => s + z, 0) / outline.length
    // The head holds the insert a little in from its cutting edges
    const seat = outline.map(([x, z]) => [cx + (x - cx) * 0.8, cz + (z - cz) * 0.8] as [number, number])
    const reach = Math.max(...outline.map(([x]) => x))
    const shankLength = Math.max(tool.length, 60)
    let holder: BufferGeometry
    if (grooving) {
      // Grooving and parting: a blade as thick as the insert, standing on edge, in a clamp block
      const w = Math.max(tool.diameter, 1)
      const blade = [[reach * 0.5, w * 0.08], [reach * 0.5, w * 0.92], [reach + 30, w * 0.92], [reach + 30, w * 0.08]] as [number, number][]
      holder = merge([
        slab(blade, -SHANK * 0.9, 3),
        box(reach + 30, reach + shankLength, -SHANK, 4, w * 0.92, w * 0.92 + SHANK),
        box(reach + 22, reach + 30, -SHANK * 0.95, 3.5, w, w * 0.92 + SHANK * 0.5)
      ])
    } else if (internal) {
      // Boring bar: the head on the bar's end, the bar back along +Z out of the bore
      const zEnd = Math.max(...outline.map(([, z]) => z)) + 2
      const head = hull([...seat, [reach + BAR * 0.15, zEnd], [reach - BAR * 0.9, zEnd], [reach - BAR * 0.9, zEnd - 4]])
      holder = merge([
        slab(head, -BAR * 0.95, -1),
        new CylinderGeometry(BAR / 2, BAR / 2, shankLength, 32).rotateX(Math.PI / 2).translate(reach - BAR * 0.4, -BAR / 2, zEnd + shankLength / 2)
      ])
    } else {
      // Square shank along +X, its side flush with the back of the insert
      const z0 = Math.min(...outline.map(([, z]) => z)) - (thread ? 2 : 0)
      const x0 = reach * (thread ? 0.75 : 0.6)
      const head = hull([...seat, [x0 + 6, z0], [x0 + 6, z0 + SHANK], [reach + 4, z0], [reach + 4, z0 + SHANK]])
      holder = merge([slab(head, -SHANK, -1), box(reach + 4, reach + shankLength, -SHANK, -1, z0, z0 + SHANK)])
    }
    // Torx screw through the insert's hole (grooving inserts are held by the blade)
    const screw = grooving ? null : new CylinderGeometry(1.9, 1.9, 0.6, 20).translate(cx, 0.3, cz)
    return { insert, holder, screw }
  }, [tool, internal])
  useDispose(parts.insert, parts.holder, parts.screw)
  return (
    <group scale={[internal ? -1 : 1, 1, tool.hand === 'left' ? -1 : 1]}>
      <mesh geometry={parts.insert}>
        <meshStandardMaterial color={COLORS.insert} metalness={0.5} roughness={0.4} />
      </mesh>
      {parts.screw && (
        <mesh geometry={parts.screw}>
          <meshStandardMaterial color={COLORS.screw} metalness={0.4} roughness={0.6} />
        </mesh>
      )}
      <mesh geometry={parts.holder}>
        <meshStandardMaterial color={COLORS.holder} metalness={0.45} roughness={0.45} />
      </mesh>
    </group>
  )
}
