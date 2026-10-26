import { z } from 'zod'
import type { OpenedFile, SaveProjectRequest } from '../preload/api'

// Arguments of the IPC handlers come from the window: their types are a promise, not a guarantee.

const OpenedFileInput = z.object({ name: z.string(), path: z.string(), text: z.string() })

const SaveProjectInput = z.object({
  project: z.record(z.string(), z.unknown()),
  projectPath: z.string(),
  programPath: z.string()
})

/** The program to save, or null if the window sent something else. */
export function parseOpenedFile(value: unknown): OpenedFile | null {
  const r = OpenedFileInput.safeParse(value)
  return r.success ? r.data : null
}

export function parseSaveProjectRequest(value: unknown): SaveProjectRequest | null {
  const r = SaveProjectInput.safeParse(value)
  return r.success ? r.data : null
}
