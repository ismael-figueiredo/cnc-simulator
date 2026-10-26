import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  chuckGeometry,
  createHeightfield,
  createProfile,
  cutHeightfield,
  cutProfile,
  findChuckCollisions,
  loadControl,
  loadMachine,
  offsetForZero,
  simulate,
  stockFromPath,
  type Stock,
  type ToolLibrary
} from '../src/core'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
function load<T>(r: { ok: true; value: T } | { ok: false; issues: unknown[] }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r.value
}
const mill = load(loadMachine(read('configs/machines/mill-3axis.json')))
const fanucM = load(loadControl(read('configs/controls/fanuc-0i-mf.json')))
const gl300 = load(loadMachine(read('configs/machines/romi-gl300.json')))
const fanucT = load(loadControl(read('configs/controls/fanuc-0i-tf-system-b.json')))
const endmill: ToolLibrary = { id: 't', name: 't', units: 'mm', holders: [], tools: [{ number: 1, name: 'Ø10', type: 'flat-endmill', diameter: 10, length: 40 }] }

const millRun = (blocks: string[]) => simulate({ text: ['O0001', 'G21 G17 G90', 'T1 M6', 'S2000 M3', ...blocks, 'M30'].join('\n'), machine: mill, control: fanucM, tools: endmill }).moves
const latheRun = (blocks: string[]) =>
  simulate({ text: ['O0001;', 'G21 G95;', 'T0101;', 'G97 S1000 M3;', ...blocks.map((b) => `${b};`), 'M30;'].join('\n'), machine: gl300, control: fanucT }).moves

const block: Stock = { shape: 'block', x: 100, y: 80, z: 30 }

describe('material removal', () => {
  it('lowers the block where a flat endmill cuts, and only there', () => {
    const h = createHeightfield(block, [0, 0, 0])
    for (const m of millRun(['G0 X20 Y40 Z5', 'G1 Z-4 F200', 'G1 X80'])) cutHeightfield(h, m, false)
    const at = (x: number, y: number) => h.heights[Math.round((y - h.y0) / h.cell) * h.nx + Math.round((x - h.x0) / h.cell)]
    expect(at(50, 40)).toBeCloseTo(-4, 5)
    expect(at(50, 44)).toBeCloseTo(-4, 5)
    expect(at(50, 60)).toBe(0)
  })

  it('leaves a rounded groove with a ball endmill', () => {
    const h = createHeightfield(block, [0, 0, 0])
    for (const m of millRun(['G0 X20 Y40 Z5', 'G1 Z-4 F200', 'G1 X80'])) cutHeightfield(h, m, true)
    const at = (x: number, y: number) => h.heights[Math.round((y - h.y0) / h.cell) * h.nx + Math.round((x - h.x0) / h.cell)] ?? 0
    expect(at(50, 40)).toBeCloseTo(-4, 1)
    expect(at(50, 44)).toBeGreaterThan(-4 + 1)
  })

  it('turns the bar down where the tool passes', () => {
    const p = createProfile({ shape: 'cylinder', diameter: 50, length: 60 }, [0, 0, 0])
    for (const m of latheRun(['G0 X40 Z2', 'G1 Z-20 F0.2', 'G1 X52'])) cutProfile(p, m)
    expect(p.radii[Math.round(10 / p.cell)]).toBeCloseTo(20, 5)
    expect(p.radii[Math.round(40 / p.cell)]).toBe(25)
  })
  it('facing to the center takes off everything in front of the cut', () => {
    // Bar face at Z1, faced at Z0: the 1 mm layer is gone, not just the slice at Z0
    const p = createProfile({ shape: 'cylinder', diameter: 50, length: 60, offset: { Z: 1 } }, [0, 0, 0])
    for (const m of latheRun(['G0 X54 Z0', 'G1 X-1 F0.15', 'G0 Z2'])) cutProfile(p, m)
    expect(p.radii[0]).toBe(0)
    expect(p.radii[Math.round(0.5 / p.cell)]).toBe(0)
    expect(p.radii[Math.round(5 / p.cell)]).toBe(25)
  })
})

describe('stock from the program', () => {
  it('wraps a mill program with a margin, top at Z0', () => {
    const s = stockFromPath(millRun(['G0 X20 Y40 Z5', 'G1 Z-4 F200', 'G1 X80']), false)
    // Tool Ø10 from X20 to X80 at Y40: X 15…85, Y 35…45, plus 2 mm
    expect(s).toEqual({ shape: 'block', x: 74, y: 14, z: 8, offset: { X: 13, Y: 33, Z: 0 } })
  })

  it('gives a lathe program a bar from the face', () => {
    const s = stockFromPath(latheRun(['G0 X40 Z2', 'G1 Z-20 F0.2', 'G1 X52']), true)
    expect(s).toMatchObject({ shape: 'cylinder', diameter: 56 })
  })

  it('places the work zero on a corner or the center of the block', () => {
    expect(offsetForZero(block, 'front-left')).toEqual({ X: 0, Y: 0, Z: 0 })
    expect(offsetForZero(block, 'center')).toEqual({ X: -50, Y: -40, Z: 0 })
    expect(offsetForZero(block, 'back-right')).toEqual({ X: -100, Y: -80, Z: 0 })
  })
})

describe('chuck', () => {
  const bar: Stock = { shape: 'cylinder', diameter: 50, length: 60 }

  it('grips the end of the bar', () => {
    expect(chuckGeometry(bar, [0, 0, 0])).toMatchObject({ face: -60, grip: 24, barRadius: 25 })
  })

  it('flags turning into the jaws, not turning on the free length', () => {
    expect(findChuckCollisions(latheRun(['G0 X40 Z2', 'G1 Z-30 F0.2', 'G1 X52']), bar, [0, 0, 0])).toEqual([])
    const hits = findChuckCollisions(latheRun(['G0 X40 Z2', 'G1 Z-50 F0.2', 'G1 X52']), bar, [0, 0, 0])
    // The cut down to Z-50 and the move out at Z-50: both blocks are inside the jaws' reach
    expect(hits.map((h) => h.z)).toEqual([-50, -50])
  })

  it('takes its size from the machine', () => {
    const chuck = { diameter: 254, jawHeight: 60, jawLength: 30, jaws: 3 }
    expect(chuckGeometry(bar, [0, 0, 0], chuck)).toMatchObject({ grip: 24, bodyRadius: 127, jawStep: 46, jawOuter: 85, jaws: 3 })
    // Past the gripping step, over the lower outer step of the long jaws
    const run = latheRun(['G0 X120 Z2', 'G1 Z-50 F0.2'])
    expect(findChuckCollisions(run, bar, [0, 0, 0])).toEqual([])
    expect(findChuckCollisions(run, bar, [0, 0, 0], chuck).map((h) => h.z)).toEqual([-50])
  })
})
