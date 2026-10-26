// G10 data setting: the program writes the tool offset and work offset tables as it runs.
import type { ToolOffset } from '../config/project'
import { AXES, type Axis } from './axes'

type Words = Partial<Record<string, number>>

/**
 * G10 tool offsets. Machining centers: L10/L11 length geometry/wear, L12/L13 radius geometry/wear,
 * value in R. Lathes: G10 P n (wear) or P 10000+n (geometry) with X Z R Q, or U W C incremental.
 * Returns the offset number and its new entry, or null when the block is not a tool offset.
 */
export function toolOffsetSetting(
  current: (n: number) => ToolOffset,
  L: number | undefined,
  P: number | undefined,
  W: Words,
  { lathe, absolute }: { lathe: boolean; absolute: boolean }
): { n: number; entry: ToolOffset } | null {
  if (P === undefined) return null
  let n: number
  const set: [keyof ToolOffset, string, string | null][] = []
  if (!lathe && L !== undefined && L >= 10 && L <= 13) {
    n = P
    set.push([L === 10 ? 'length' : L === 11 ? 'lengthWear' : L === 12 ? 'radius' : 'radiusWear', 'R', null])
  } else if (lathe && (L === undefined || L === 1) && P >= 1) {
    const geometry = P >= 10000
    n = geometry ? P - 10000 : P
    set.push([geometry ? 'x' : 'xWear', 'X', 'U'], [geometry ? 'z' : 'zWear', 'Z', 'W'], [geometry ? 'nose' : 'noseWear', 'R', 'C'], ['tip', 'Q', null])
  } else return null
  const entry = { ...current(n) }
  for (const [field, abs, inc] of set) {
    const a = W[abs]
    const i = inc ? W[inc] : undefined
    // Lathes: X Z R absolute, U W C incremental. Machining centers: R follows G90/G91.
    if (a !== undefined) entry[field] = field === 'tip' ? Math.round(a) : lathe || absolute ? a : (entry[field] ?? 0) + a
    if (i !== undefined) entry[field] = (entry[field] ?? 0) + i
  }
  return { n, entry }
}

/** G10 L2 P1–P6 (G54–G59) and L20 P n (G54.1 P n): the work offset it writes, or null. */
export function workOffsetName(L: number | undefined, P: number | undefined): string | null {
  if (L === 2 && P !== undefined && P >= 1 && P <= 6) return `G${53 + P}`
  if (L === 20 && P !== undefined && P >= 1) return `G54.1 P${P}`
  return null
}

/** The work offset after a G10 block: axis words absolute in G90 (incremental in G91), U V W… always incremental. */
export function writeWorkOffset(
  current: Partial<Record<Axis, number>>,
  W: Words,
  absolute: boolean,
  incremental: ReadonlyMap<string, Axis>
): Partial<Record<Axis, number>> {
  const o = { ...current }
  for (const ax of AXES) {
    const w = W[ax]
    if (w !== undefined) o[ax] = absolute ? w : (o[ax] ?? 0) + w
  }
  for (const [addr, ax] of incremental) {
    const w = W[addr]
    if (w !== undefined) o[ax] = (o[ax] ?? 0) + w
  }
  return o
}
