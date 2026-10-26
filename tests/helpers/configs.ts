import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadAlarmCatalog, loadControl, loadMachine, loadToolLibrary, type LoadResult } from '../../src/core'

// The bundled configs and examples, read the way the app gets them: as text, validated by the loaders.

export const root = join(__dirname, '..', '..')

/** A repository file as text (path relative to the repository root). */
export const read = (path: string) => readFileSync(join(root, path), 'utf8')

/** The loaded value; a config that does not validate fails the test with its issues. */
export function load<T>(r: LoadResult<T>): T {
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r.value
}

export const machineConfig = (id: string) => load(loadMachine(read(`configs/machines/${id}.json`)))
export const controlConfig = (id: string) => load(loadControl(read(`configs/controls/${id}.json`)))
export const alarmConfig = (id: string) => load(loadAlarmCatalog(read(`configs/alarms/${id}.json`)))
export const toolConfig = (id: string) => load(loadToolLibrary(read(`configs/tools/${id}.json`)))
