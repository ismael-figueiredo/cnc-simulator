import { z } from 'zod'
import { parse, validate, type LoadResult } from './load'
import { AxisNameSchema, LocalizedTextSchema, StockShapeSchema, ToolLibrarySchema } from './schema'

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
  workOffsets: WorkOffsetsSchema.optional()
})

export type Stock = z.infer<typeof StockSchema>
export type WorkOffsets = z.infer<typeof WorkOffsetsSchema>
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

export function loadProject(data: unknown, source = 'project'): LoadResult<Project> {
  const j = parse(data, source)
  return j.ok ? validate(ProjectSchema, j.value, source) : j
}
