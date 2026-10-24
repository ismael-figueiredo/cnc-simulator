import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compareParts, loadControl, loadExercise, loadMachine, loadToolLibrary, simulate, workShift, type Exercise, type Vec3 } from '../src/core'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
function load<T>(r: { ok: true; value: T } | { ok: false; issues: unknown[] }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r.value
}
const files = readdirSync(join(root, 'examples/learn')).filter((f) => f.endsWith('.json'))

/** Runs a program of the exercise as the app does: its machine, control, default tools and work offsets. */
function run(ex: Exercise, text: string) {
  const machine = load(loadMachine(read(`configs/machines/${ex.machine}.json`)))
  const control = load(loadControl(read(`configs/controls/${ex.control}.json`)))
  const tools = machine.defaultTools ? load(loadToolLibrary(read(`configs/tools/${machine.defaultTools}.json`))) : null
  const lathe = machine.kinematics.startsWith('lathe')
  const s = workShift(ex.workOffsets ?? {}, ex.stock.workOffset ?? 'G54')
  const zero: Vec3 = lathe ? [0, 0, s.Z] : [s.X, s.Y, s.Z]
  return { result: simulate({ text, machine, control, tools, workOffsets: ex.workOffsets }), lathe, zero }
}

describe('guided exercises', () => {
  it('has the four exercises', () => {
    expect(files).toEqual(['E01_DOIS_DIAMETROS.json', 'E02_CICLOS_G71_G70.json', 'E03_CONTORNO_E_FUROS.json', 'E04_FUROS_COM_WHILE.json'])
  })

  it.each(files)('%s: the solution runs, the start program does not pass yet', (file) => {
    const ex = load(loadExercise(read(`examples/learn/${file}`), file))
    const sol = run(ex, ex.solution)
    expect(sol.result.diagnostics.filter((d) => d.severity === 'alarm').map((d) => `${d.code} L${d.line + 1}`)).toEqual([])
    expect(sol.result.finished).toBe(true)
    const same = compareParts(sol.result.moves, sol.result.moves, ex.stock, sol.zero, sol.lathe)
    expect([same.left, same.gouge]).toEqual([0, 0])

    const start = run(ex, ex.start)
    expect(start.result.diagnostics.filter((d) => d.severity === 'alarm')).toEqual([])
    const diff = compareParts(sol.result.moves, start.result.moves, ex.stock, sol.zero, sol.lathe)
    expect(diff.left).toBeGreaterThan(ex.tolerance)
  })

  it('accepts another program that makes the same part (E04 without the loop)', () => {
    const ex = load(loadExercise(read('examples/learn/E04_FUROS_COM_WHILE.json')))
    const sol = run(ex, ex.solution)
    const plain = run(ex, ex.solution.replace(/#102 = 0[\s\S]*END1/, ['G99 G81 X5. Y20. Z-5. R2. F220.', 'X17.', 'X29.', 'X41.', 'X53.'].join('\n')))
    const diff = compareParts(sol.result.moves, plain.result.moves, ex.stock, sol.zero, sol.lathe)
    expect(diff.left).toBeLessThanOrEqual(ex.tolerance)
    expect(diff.gouge).toBeLessThanOrEqual(ex.tolerance)
  })

  it('finds a cut into the part and where it is (E01 with Ø29 instead of Ø30)', () => {
    const ex = load(loadExercise(read('examples/learn/E01_DOIS_DIAMETROS.json')))
    const sol = run(ex, ex.solution)
    const wrong = run(ex, ex.solution.replace('G01 X30. ,C1.;', 'G01 X29. ,C1.;').replace('X30.6;', 'X29.6;'))
    const diff = compareParts(sol.result.moves, wrong.result.moves, ex.stock, sol.zero, sol.lathe)
    expect(diff.gouge).toBeCloseTo(1, 1)
    expect(diff.gougeAt?.[2]).toBeLessThan(0)
    expect(diff.gougeAt?.[2]).toBeGreaterThan(-15.5)
  })
})
