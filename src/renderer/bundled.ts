// Machines, controls, tools, alarms, examples and exercises that ship with the app, shared by the
// shell (start screen, open dialog) and every document tab.
import {
  loadAlarmCatalog,
  loadControl,
  loadExercise,
  loadMachine,
  loadProject,
  loadToolLibrary,
  type AlarmCatalog,
  type ConfigIssue,
  type Control,
  type Machine,
  type ToolLibrary
} from '@core/index'

// Every JSON in configs/ ships with the app: dropping a file in the folder adds it.
const machineFiles = import.meta.glob<unknown>('../../configs/machines/*.json', { eager: true, import: 'default' })
const controlFiles = import.meta.glob<unknown>('../../configs/controls/*.json', { eager: true, import: 'default' })
const toolFiles = import.meta.glob<unknown>('../../configs/tools/*.json', { eager: true, import: 'default' })
const alarmFiles = import.meta.glob<unknown>('../../configs/alarms/*.json', { eager: true, import: 'default' })
export const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1)
/** The Romi GL 250 M opens first: it is the machine of the bundled O1500 example. */
const FIRST_MACHINE = 'romi-gl250-m'
// Bundled examples: each is a project (examples/*.cncsim) next to its program
const exampleProjects = import.meta.glob<string>('../../examples/*.cncsim', { eager: true, query: '?raw', import: 'default' })
const examplePrograms = import.meta.glob<string>('../../examples/*.nc', { eager: true, query: '?raw', import: 'default' })
export const EXAMPLES = Object.entries(exampleProjects)
  .map(([path, text]) => {
    const r = loadProject(text, fileName(path))
    if (!r.ok) return null
    const program = examplePrograms[`../../examples/${r.value.program}`]
    return program === undefined ? null : { id: fileName(path), project: r.value, projectText: text, programText: program }
  })
  .filter((e) => e !== null)
  .sort((a, b) => a.id.localeCompare(b.id))
export const isExample = (path: string) => path.startsWith('example:')
// Guided exercises (examples/learn): statement, starting program and solution in one file
const exerciseFiles = import.meta.glob<string>('../../examples/learn/*.json', { eager: true, query: '?raw', import: 'default' })
export const EXERCISES = Object.entries(exerciseFiles)
  .map(([path, text]) => {
    const r = loadExercise(text, fileName(path))
    return r.ok ? { id: fileName(path).replace(/\.json$/, ''), exercise: r.value } : null
  })
  .filter((e) => e !== null)
  .sort((a, b) => a.id.localeCompare(b.id))


export interface Program {
  name: string
  /** File path on the desktop; the file name (or "example:…") in the browser. */
  path: string
  text: string
}

export interface BundledConfigs {
  machines: Machine[]
  controls: Control[]
  library: ToolLibrary | null
  libraries: ToolLibrary[]
  alarmCatalogs: AlarmCatalog[]
  issues: ConfigIssue[]
}

// Configs shipped with the app. Phase 3 adds loading the user's own JSON files.
// Takes the language only so callers re-run it when validation messages must be translated again.
export function loadBundled(_lang: string): BundledConfigs {
  const issues: ConfigIssue[] = []
  function loadAll<T>(files: Record<string, unknown>, load: (data: unknown, source: string) => { ok: true; value: T } | { ok: false; issues: ConfigIssue[] }): T[] {
    const out: T[] = []
    for (const [path, data] of Object.entries(files)) {
      const r = load(data, fileName(path))
      if (r.ok) out.push(r.value)
      else issues.push(...r.issues)
    }
    return out
  }
  const machines = loadAll(machineFiles, loadMachine).sort(
    (a, b) => Number(b.id === FIRST_MACHINE) - Number(a.id === FIRST_MACHINE) || a.name.localeCompare(b.name)
  )
  const controls = loadAll(controlFiles, loadControl).sort((a, b) => a.name.localeCompare(b.name))
  const libraries = loadAll(toolFiles, loadToolLibrary)
  const alarmCatalogs = loadAll(alarmFiles, loadAlarmCatalog)
  return { machines, controls, library: libraries[0] ?? null, libraries, alarmCatalogs, issues }
}
