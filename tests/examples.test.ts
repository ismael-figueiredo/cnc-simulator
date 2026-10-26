import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  findChuckCollisions,
  findHolderCollisions,
  loadAlarmCatalog,
  loadControl,
  loadMachine,
  loadProject,
  loadToolLibrary,
  simulate,
  workShift,
  type ToolLibrary
} from '../src/core'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
function load<T>(r: { ok: true; value: T } | { ok: false; issues: unknown[] }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r.value
}
const libraries = new Map<string, ToolLibrary>(
  readdirSync(join(root, 'configs/tools')).map((f) => {
    const lib = load(loadToolLibrary(read(`configs/tools/${f}`)))
    return [lib.id, lib]
  })
)

/** Each bundled example as the app opens it: project setup, machine default tools, alarms. */
function runExample(file: string) {
  const project = load(loadProject(read(`examples/${file}`), file))
  const machine = load(loadMachine(read(`configs/machines/${project.machine}.json`)))
  const control = load(loadControl(read(`configs/controls/${project.control}.json`)))
  const alarms = control.alarms ? load(loadAlarmCatalog(read(`configs/alarms/${control.alarms}.json`))) : null
  const tools = project.tools ?? libraries.get(machine.defaultTools ?? '') ?? null
  const result = simulate({ text: read(`examples/${project.program}`), machine, control, tools, alarms, workOffsets: project.workOffsets })
  const lathe = machine.kinematics.startsWith('lathe')
  const stock = project.stock ?? (machine.defaultStock ? { ...machine.defaultStock } : null)
  const s = workShift(project.workOffsets ?? {}, stock?.workOffset ?? 'G54')
  const collisions = findHolderCollisions({ moves: result.moves, tools, stock, stockZero: lathe ? [0, 0, s.Z] : [s.X, s.Y, s.Z], lathe })
  const chuck = lathe ? findChuckCollisions(result.moves, stock, [0, 0, s.Z]) : []
  return { result, collisions, chuck }
}

const examples = readdirSync(join(root, 'examples')).filter((f) => f.endsWith('.cncsim'))

describe('bundled examples', () => {
  it('has the lathe and machining center examples', () => {
    expect(examples).toEqual(expect.arrayContaining(['O1001_EIXO_GL300.cncsim', 'O1002_CICLOS_GL300.cncsim', 'O1500_COROA_ANSI40.cncsim', 'O2001_PLACA_D600.cncsim', 'O2002_DUAS_MORSAS_D600.cncsim', 'O3001_HAAS_VF2.cncsim']))
  })

  it.each(examples)('%s runs to the end without alarms', (file) => {
    const { result } = runExample(file)
    expect(result.diagnostics.filter((d) => d.severity === 'alarm').map((d) => `${d.code} L${d.line + 1}`)).toEqual([])
    expect(result.finished).toBe(true)
    // With the tool offsets measured from the tools, no example leaves the machine travels
    expect(result.diagnostics.filter((d) => d.code === 'overtravel').map((d) => `L${d.line + 1} ${JSON.stringify(d.params)}`)).toEqual([])
  })

  it.each(examples)('%s keeps the tools off the chuck', (file) => {
    expect(runExample(file).chuck).toEqual([])
  })

  it.each(examples)('%s has no holder or chuck collision', (file) => {
    const { collisions, chuck } = runExample(file)
    expect(collisions.map((c) => `T${c.tool} L${c.line + 1}`)).toEqual([])
    expect(chuck.map((c) => `T${c.tool} L${c.line + 1}`)).toEqual([])
  })

  it.each(examples)('%s runs with no warning', (file) => {
    const { result } = runExample(file)
    expect(result.diagnostics.map((d) => `${d.severity} ${d.code} L${d.line + 1}`)).toEqual([])
  })
})
