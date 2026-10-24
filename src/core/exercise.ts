// Guided exercises: a statement, a starting program and a reference solution. The student's part is
// checked against the part the solution machines, cell by cell, on the same stock.
import { z } from 'zod'
import { parse, validate, type LoadResult } from './config/load'
import { StockSchema, WorkOffsetsSchema, type Stock } from './config/project'
import { LocalizedTextSchema } from './config/schema'
import { createHeightfield, createProfile, cutHeightfield, cutProfile } from './removal'
import type { Move, Vec3 } from './types'

export const ExerciseSchema = z.object({
  format: z.literal('cnc-simulator-exercise'),
  version: z.literal(1),
  title: LocalizedTextSchema,
  /** What to make, step by step; lines are kept. */
  statement: LocalizedTextSchema,
  /** 1 first steps, 2 cycles and compensation, 3 parametric programs. */
  level: z.number().int().min(1).max(3),
  machine: z.string(),
  control: z.string(),
  stock: StockSchema,
  workOffsets: WorkOffsetsSchema.optional(),
  /** Largest difference accepted between the student's part and the solution's, in mm. */
  tolerance: z.number().positive().default(0.1),
  /** Program the student starts from, and the reference solution. */
  start: z.string(),
  solution: z.string()
})
export type Exercise = z.infer<typeof ExerciseSchema>

export function loadExercise(data: unknown, source = 'exercise'): LoadResult<Exercise> {
  const j = parse(data, source)
  return j.ok ? validate(ExerciseSchema, j.value, source) : j
}

/** How far the student's part is from the solution's. Lathes give diameters. */
export interface PartComparison {
  /** Material still there that the solution removes (mm), and where the most is. */
  left: number
  leftAt: Vec3 | null
  /** Material removed that the solution keeps: a cut into the part (mm), and where the deepest is. */
  gouge: number
  gougeAt: Vec3 | null
}

/**
 * Machines the same stock with both move lists and compares the result: the turned radius along Z
 * on lathes (reported as a diameter), the top-face height over X/Y on block stock.
 */
export function compareParts(reference: readonly Move[], student: readonly Move[], stock: Stock, zero: Vec3, lathe: boolean, ballTools: ReadonlySet<number> = new Set()): PartComparison {
  const out: PartComparison = { left: 0, leftAt: null, gouge: 0, gougeAt: null }
  if (lathe) {
    const ref = createProfile(stock, zero)
    const got = createProfile(stock, zero)
    for (const m of reference) cutProfile(ref, m)
    for (const m of student) cutProfile(got, m)
    for (let i = 0; i < ref.radii.length; i++) {
      const d = 2 * ((got.radii[i] ?? 0) - (ref.radii[i] ?? 0))
      const at: Vec3 = [ref.radii[i] ?? 0, 0, ref.face - i * ref.cell]
      if (d > out.left) Object.assign(out, { left: d, leftAt: at })
      if (-d > out.gouge) Object.assign(out, { gouge: -d, gougeAt: at })
    }
    return out
  }
  const ref = createHeightfield(stock, zero)
  const got = createHeightfield(stock, zero)
  for (const m of reference) cutHeightfield(ref, m, ballTools.has(m.state.tool))
  for (const m of student) cutHeightfield(got, m, ballTools.has(m.state.tool))
  for (let j = 0; j < ref.ny; j++)
    for (let i = 0; i < ref.nx; i++) {
      const k = j * ref.nx + i
      const d = (got.heights[k] ?? 0) - (ref.heights[k] ?? 0)
      const at: Vec3 = [ref.x0 + i * ref.cell, ref.y0 + j * ref.cell, ref.heights[k] ?? 0]
      if (d > out.left) Object.assign(out, { left: d, leftAt: at })
      if (-d > out.gouge) Object.assign(out, { gouge: -d, gougeAt: at })
    }
  return out
}
