// Where the machining center table and the vise sit around the stock, for the 3D view.
// Pure functions: the renderer draws what they return and the tests check it.
import { SAME_POSITION } from './tolerance'
import { stockSize, type Stock, type WorkOffsets } from './config/project'
import { isLathe } from './config/kinds'
import type { Machine } from './config/schema'
import { stockOrigin } from './removal'
import type { Vec3 } from './types'

export interface ViseLayout {
  /** Jaw span along X and the stock faces the jaws close on, along Y (scene coordinates). */
  x: [number, number]
  y: [number, number]
  /** Z of the vise base (on the table), of the stock's seat on the vise and of the jaws' top edge. */
  base: number
  seat: number
  jawTop: number
}

export interface TableLayout {
  /** Scene Z of the table top and X/Y of its center. */
  top: number
  center: [number, number]
  length: number
  width: number
  height: number
  /** Y of each T-slot from the table center. */
  slots: number[]
  slotWidth: number
  vise: ViseLayout | null
}

/** Stock this wide (along Y) or wider is clamped on the table, not in a vise. */
const VISE_CAPACITY = 250
/** Stock bottom above the table top that a vise fills; outside it the offsets do not describe a vise. */
const VISE_GAP: [number, number] = [40, 300]
/** Vise height under the stock when the table position is not known. */
const DEFAULT_VISE = 90
/** The jaws stand this share of the stock height above its seat, at most VISE_JAW_TOP_MAX mm. */
const VISE_JAW_SHARE = 0.4
const VISE_JAW_TOP_MAX = 15
/** Table height and T-slot width where the machine's JSON does not give them (mm). */
const TABLE_HEIGHT = 70
const SLOT_WIDTH = 18

/**
 * The table under a block stock. With G54 and the table's machine position (`table.top`, `table.center`
 * in the JSON) it is drawn where it is on the machine; otherwise right under the stock. A vise holds
 * the stock when it fits in one and does not sit on the table.
 */
export function tableLayout(machine: Machine, stock: Stock, workOffsets: WorkOffsets, zero: Vec3): TableLayout | null {
  if (stock.shape !== 'block' || isLathe(machine)) return null
  const t = machine.table ?? defaultTable(machine)
  const o = stockOrigin(stock, zero)
  const { x: sx, y: sy, z: sz } = stockSize(stock)
  const bottom = o[2] - sz
  const middle: [number, number] = [o[0] + sx / 2, o[1] + sy / 2]
  const g54 = workOffsets['G54'] ?? {}

  // Table center from its machine position, kept only if the whole stock lands on the table
  let center = middle
  if (t.center && g54.X !== undefined && g54.Y !== undefined) {
    const c: [number, number] = [t.center.X - g54.X, t.center.Y - g54.Y]
    const onTable = Math.abs(middle[0] - c[0]) + sx / 2 <= t.length / 2 && Math.abs(middle[1] - c[1]) + sy / 2 <= t.width / 2
    if (onTable) center = c
  }

  const fits = sy < VISE_CAPACITY
  const gap = t.top !== undefined && g54.Z !== undefined ? bottom - (t.top - g54.Z) : null
  let top: number
  if (gap !== null && gap >= 0 && gap < VISE_GAP[0]) top = bottom
  else if (gap !== null && gap >= VISE_GAP[0] && gap <= VISE_GAP[1] && fits) top = bottom - gap
  else top = fits ? bottom - DEFAULT_VISE : bottom

  const vise: ViseLayout | null =
    top < bottom - SAME_POSITION
      ? {
          x: [middle[0] - viseJaw(sx) / 2, middle[0] + viseJaw(sx) / 2],
          y: [o[1], o[1] + sy],
          base: top,
          seat: bottom,
          jawTop: bottom + Math.min(sz * VISE_JAW_SHARE, VISE_JAW_TOP_MAX)
        }
      : null

  const n = t.slots ?? 3
  const pitch = t.slotPitch ?? Math.floor(t.width / (n + 1) / 5) * 5
  const slots = Array.from({ length: n }, (_, k) => (k - (n - 1) / 2) * pitch)
  return { top, center, length: t.length, width: t.width, height: t.height ?? TABLE_HEIGHT, slots, slotWidth: t.slotWidth ?? SLOT_WIDTH, vise }
}

/** Jaw width along X: a 6" vise for most parts, wider for long ones. */
const viseJaw = (sx: number) => Math.min(200, Math.max(100, Math.round(sx * 0.8)))

/** Without `table` in the JSON: a table sized from the X/Y travels, centered on them. */
function defaultTable(machine: Machine): NonNullable<Machine['table']> {
  const axis = (n: string) => machine.axes.find((a) => a.name === n)
  const x = axis('X')
  const y = axis('Y')
  const length = x ? Math.round(((x.max - x.min) * 1.25) / 10) * 10 : 800
  const width = y ? Math.round(((y.max - y.min) * 0.9) / 10) * 10 : 400
  return {
    length,
    width,
    slots: width < 450 ? 3 : 5,
    center: x && y ? { X: (x.min + x.max) / 2, Y: (y.min + y.max) / 2 } : undefined
  }
}
