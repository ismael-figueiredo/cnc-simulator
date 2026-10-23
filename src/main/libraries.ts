import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'

// The user's tool libraries: one JSON per library in the user data folder (survives updates).
// They are validated by the renderer with the same schema as the bundled ones.
const dir = () => join(app.getPath('userData'), 'tools')
const fileOf = (id: string) => join(dir(), `${id.replace(/[^\w.-]/g, '_')}.json`)

export async function listLibraries(): Promise<string[]> {
  try {
    const files = (await readdir(dir())).filter((f) => f.endsWith('.json'))
    return await Promise.all(files.map((f) => readFile(join(dir(), f), 'utf8')))
  } catch {
    return [] // no library saved yet
  }
}

export async function saveLibrary(id: string, json: string): Promise<void> {
  await mkdir(dir(), { recursive: true })
  await writeFile(fileOf(id), json, 'utf8')
}

export async function deleteLibrary(id: string): Promise<void> {
  await rm(fileOf(id), { force: true })
}
