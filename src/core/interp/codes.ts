import type { z } from 'zod'
import type { Control, GFunction, MFunction } from '../config/schema'

export type GFn = z.infer<typeof GFunction>
export type MFn = z.infer<typeof MFunction>

export interface CodeTable {
  g: Map<number, GFn>
  m: Map<number, MFn>
}

/** "G07.1" → 7.1, "M03" → 3. Programs write G1, G01 or G01.0 for the same code. */
export const codeNumber = (key: string): number => Math.round(parseFloat(key.slice(1)) * 10) / 10

export function buildCodeTable(control: Control): CodeTable {
  const g = new Map<number, GFn>()
  const m = new Map<number, MFn>()
  for (const [k, v] of Object.entries(control.gCodes)) g.set(codeNumber(k), v.function)
  for (const [k, v] of Object.entries(control.mCodes)) m.set(codeNumber(k), v.function)
  return { g, m }
}

/** How a code is shown back to the user: G1 → "G01", G12.1 → "G12.1". */
export const formatCode = (letter: 'G' | 'M', n: number): string =>
  letter + (Number.isInteger(n) ? String(n).padStart(2, '0') : String(n))
