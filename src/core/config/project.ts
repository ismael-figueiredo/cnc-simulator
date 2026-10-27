import { z } from 'zod'
import { parse, validate, type LoadResult } from './load'
import { AxisNameSchema, LocalizedTextSchema, StockShapeSchema, ToolLibrarySchema } from './schema'
import type { Vec3 } from '../types'

// A project (.cncsim) keeps everything a job needs besides the program: machine, control,
// tools, stock and work offsets. The program stays a separate file next to it.

export const StockSchema = StockShapeSchema.extend({
  /** CSS color of the material, e.g. "#9aa6b1". */
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
  /** Shift of the stock from its work zero, in mm. */
  offset: z.partialRecord(AxisNameSchema, z.number()).optional(),
  /** Work offset the stock sits on (the part zero it was measured from). */
  workOffset: z.string().optional()
})

/** "G54"…"G59", "G54.1 P1"…: machine position of each part zero. */
export const WorkOffsetsSchema = z.record(
  z.string().regex(/^G5[4-9](\.1 P\d{1,3})?$/),
  z.partialRecord(AxisNameSchema, z.number())
)

/**
 * One tool offset, as on the control's OFFSET screen. Machining centers use the length (H) and the
 * radius (D); lathes the geometry X/Z (X as programmed, a diameter), the nose radius and tip direction.
 * Each has a geometry value and a wear value that adds to it.
 */
export const ToolOffsetSchema = z.object({
  length: z.number().optional(),
  lengthWear: z.number().optional(),
  radius: z.number().optional(),
  radiusWear: z.number().optional(),
  x: z.number().optional(),
  xWear: z.number().optional(),
  z: z.number().optional(),
  zWear: z.number().optional(),
  nose: z.number().optional(),
  noseWear: z.number().optional(),
  tip: z.number().int().min(0).max(9).optional()
})

/** Offset number ("1", "12"…) → values. */
export const ToolOffsetsSchema = z.record(z.string().regex(/^\d{1,3}$/), ToolOffsetSchema)

export const PROJECT_FORMAT = 'cnc-simulator-project'

export const ProjectSchema = z.object({
  format: z.literal(PROJECT_FORMAT),
  version: z.literal(1),
  /** What the job is, shown on the start screen for the bundled examples. */
  description: LocalizedTextSchema.optional(),
  /** Program file, relative to the project file. */
  program: z.string(),
  /** Browser mode only: the program text itself, since there are no file paths to follow. */
  programText: z.string().optional(),
  machine: z.string(),
  control: z.string(),
  /** Copy of the tools used, so the project opens the same on another computer. */
  tools: ToolLibrarySchema.optional(),
  stock: StockSchema.optional(),
  workOffsets: WorkOffsetsSchema.optional(),
  /** Tool offset table; when missing, it comes from the tools (lengths, radii, nose radii). */
  toolOffsets: ToolOffsetsSchema.optional()
})

export type Stock = z.infer<typeof StockSchema>

/** Sizes used where the stock leaves one out (mm). */
export const DEFAULT_STOCK = { x: 100, y: 80, z: 30, diameter: 50, length: 30 } as const

/** Every size of the stock, with the defaults for those not given. */
export function stockSize(s: Stock): { x: number; y: number; z: number; diameter: number; length: number } {
  return { x: s.x ?? DEFAULT_STOCK.x, y: s.y ?? DEFAULT_STOCK.y, z: s.z ?? DEFAULT_STOCK.z, diameter: s.diameter ?? DEFAULT_STOCK.diameter, length: s.length ?? DEFAULT_STOCK.length }
}
export type WorkOffsets = z.infer<typeof WorkOffsetsSchema>
export type ToolOffset = z.infer<typeof ToolOffsetSchema>
export type ToolOffsets = z.infer<typeof ToolOffsetsSchema>
export type Project = z.infer<typeof ProjectSchema>

/**
 * Shift of a work offset from G54, per axis. The 3D view is drawn in the G54 frame,
 * so a program running in G55 (or a stock sitting on G55) is moved by this much.
 */
export function workShift(offsets: WorkOffsets, name: string): Record<'X' | 'Y' | 'Z', number> {
  const o = offsets[name] ?? {}
  const base = offsets['G54'] ?? {}
  return { X: (o.X ?? 0) - (base.X ?? 0), Y: (o.Y ?? 0) - (base.Y ?? 0), Z: (o.Z ?? 0) - (base.Z ?? 0) }
}

/** Scene position of a work offset's zero (the drawing frame is G54). Lathe: on the spindle axis. */
export function workZero(offsets: WorkOffsets, name: string, lathe: boolean): Vec3 {
  const s = workShift(offsets, name)
  return lathe ? [0, 0, s.Z] : [s.X, s.Y, s.Z]
}

/**
 * The stock stays clamped on the table when its work offset changes in the table: what moves is the
 * zero, so the program cuts somewhere else on the part (or in the air), as on the machine. The stock's
 * offset from that zero changes by as much the other way. An axis set for the first time is the zero
 * being defined, not moved, so it leaves the stock where it is drawn.
 */
export function keepStockOnTable(stock: Stock, before: WorkOffsets, after: WorkOffsets): Stock {
  const name = stock.workOffset ?? 'G54'
  const was = before[name] ?? {}
  const now = after[name] ?? {}
  const offset = { ...stock.offset }
  let moved = false
  for (const ax of ['X', 'Y', 'Z'] as const) {
    const a = was[ax]
    const b = now[ax]
    if (a === undefined || b === undefined || a === b) continue
    offset[ax] = (offset[ax] ?? 0) - (b - a)
    moved = true
  }
  return moved ? { ...stock, offset } : stock
}

export function loadProject(data: unknown, source = 'project'): LoadResult<Project> {
  const j = parse(data, source)
  return j.ok ? validate(ProjectSchema, j.value, source) : j
}
