import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadControl, loadMachine, simulate, workShift, type Control, type Machine, type Move, type WorkOffsets } from '../src/core'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
function load<T>(r: { ok: true; value: T } | { ok: false; issues: unknown[] }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r.value
}
const mill: Machine = load(loadMachine(read('configs/machines/mill-3axis.json')))
const fanucM: Control = load(loadControl(read('configs/controls/fanuc-0i-mf.json')))

const program = (blocks: string[]) => ['O0001', 'G21 G17 G90 G40', ...blocks, 'M30'].join('\n')
const run = (blocks: string[], workOffsets?: WorkOffsets) => simulate({ text: program(blocks), machine: mill, control: fanucM, workOffsets })
const end = (m: Move | undefined) => m?.points[m.points.length - 1]
const codes = (r: ReturnType<typeof simulate>) => r.diagnostics.map((d) => d.code)

/** Two vises on the table: G54 at machine X100 Y100 Z-300, G55 200 mm to the right. */
const TWO_VISES: WorkOffsets = { G54: { X: 100, Y: 100, Z: -300 }, G55: { X: 300, Y: 100, Z: -300 } }

describe('work offsets', () => {
  it('without a table, the path is the same as before (program coordinates)', () => {
    const r = run(['G54 G0 X10 Y20', 'G1 Z-1 F100'])
    expect(end(r.moves[0])).toEqual([10, 20, 0])
    expect(r.moves[0]?.position).toMatchObject({ X: 10, Y: 20 })
  })

  it('draws G55 shifted by its difference to G54', () => {
    const r = run(['G54 G0 X10 Y20', 'G55 G0 X10 Y20'], TWO_VISES)
    expect(end(r.moves[0])?.slice(0, 2)).toEqual([10, 20])
    expect(end(r.moves[1])?.slice(0, 2)).toEqual([210, 20])
    // Z was not programmed: the tool is still at machine zero, 300 mm above the G54 part zero
    expect(end(r.moves[1])?.[2]).toBe(300)
    // The ABSOLUTE screen shows the program coordinates in the active offset
    expect(r.moves[1]?.position).toMatchObject({ X: 10, Y: 20 })
    expect(r.moves[1]?.state.workOffset).toBe('G55')
  })

  it('reports machine coordinates from the G54 values', () => {
    const r = run(['G54 G0 X10 Y20 Z5', 'G55 G0 X0 Y0'], TWO_VISES)
    expect(r.moves[0]?.machinePosition).toMatchObject({ X: 110, Y: 120, Z: -295 })
    expect(r.moves[1]?.machinePosition).toMatchObject({ X: 300, Y: 100 })
  })

  it('moves G53 to machine coordinates', () => {
    const r = run(['G54 G0 X10 Y10', 'G53 G0 X0 Y0'], TWO_VISES)
    // Machine zero is at G54 X-100 Y-100
    expect(end(r.moves[1])?.slice(0, 2)).toEqual([-100, -100])
  })

  it('G10 L2 writes the offset while the program runs', () => {
    const r = run(['G10 L2 P2 X300 Y100 Z-300', 'G55 G0 X0 Y0'], { G54: { X: 100, Y: 100, Z: -300 } })
    expect(end(r.moves[0])?.slice(0, 2)).toEqual([200, 0])
    expect(codes(r)).toContain('work-offset-set')
  })

  it('G10 L20 writes G54.1 P n, selected with G54.1 P n', () => {
    const r = run(['G10 L20 P3 X150 Y100 Z-300', 'G54.1 P3 G0 X0 Y0'], { G54: { X: 100, Y: 100, Z: -300 } })
    expect(end(r.moves[0])?.slice(0, 2)).toEqual([50, 0])
    expect(r.moves[0]?.state.workOffset).toBe('G54.1 P3')
  })

  it('warns about overtravel only on axes with a known G54', () => {
    // Machine X goes 0…800: G54 X100 + X750 = 850
    const r = run(['G54 G0 X750 Y10'], TWO_VISES)
    const ot = r.diagnostics.find((d) => d.code === 'overtravel')
    expect(ot).toMatchObject({ severity: 'warning', params: { axis: 'X', value: 850, max: 800 } })
    expect(codes(run(['G54 G0 X750 Y10']))).not.toContain('overtravel')
  })

  it('names an offset the table does not have', () => {
    const r = run(['G56 G0 X0 Y0'], TWO_VISES)
    expect(r.diagnostics.find((d) => d.code === 'work-offset-not-set')?.params).toEqual({ name: 'G56' })
  })

  it('shifts the stock by its work offset', () => {
    expect(workShift(TWO_VISES, 'G55')).toEqual({ X: 200, Y: 0, Z: 0 })
    expect(workShift(TWO_VISES, 'G54')).toEqual({ X: 0, Y: 0, Z: 0 })
    expect(workShift({}, 'G57')).toEqual({ X: 0, Y: 0, Z: 0 })
  })
})

describe('position system variables', () => {
  it('follow the machine axis order: X Y Z on a mill', () => {
    const r = run(['G54 G0 X10 Y20 Z5', '#100=#5002', '#101=#5003', '#102=#5022', 'G0 X#100 Y#101'], TWO_VISES)
    // #5002 = Y 20, #5003 = Z 5, #5022 = machine Y 120
    expect(r.variables.filter((v) => v.n >= 100).map((v) => [v.n, v.value])).toEqual([[100, 20], [101, 5], [102, 120]])
  })
})
