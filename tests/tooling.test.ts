import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  findHolderCollisions,
  GENERIC_HOLDERS,
  holderOf,
  holderOutline,
  loadControl,
  loadMachine,
  loadToolLibrary,
  simulate,
  toolMount,
  toolOutline,
  type Tool,
  type ToolLibrary
} from '../src/core'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
function load<T>(r: { ok: true; value: T } | { ok: false; issues: unknown[] }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r.value
}

const endmill: Tool = { number: 1, name: 'Ø10', type: 'flat-endmill', diameter: 10, length: 30, fluteLength: 20 }
const lib = (tools: Tool[]): ToolLibrary => ({ id: 't', name: 't', units: 'mm', holders: [], tools })

describe('tool geometry', () => {
  it('builds the tool from the tip up to its length', () => {
    const o = toolOutline(endmill)
    expect(o[0]).toEqual([0, 0])
    expect(o[1]).toEqual([5, 0])
    expect(o[o.length - 1]?.[1]).toBe(30)
  })

  it('gives drills a 118° point', () => {
    const o = toolOutline({ ...endmill, type: 'drill' })
    expect(o[1]).toEqual([5, 3])
  })

  it('stacks the holder on top of the tool, nose first', () => {
    const o = holderOutline(GENERIC_HOLDERS.mill, 30)
    expect(o[0]).toEqual([20, 30])
    expect(o[o.length - 1]).toEqual([31.75, 105])
  })

  it('mounts turning tools apart and uses a generic holder for milling tools', () => {
    expect(toolMount({ ...endmill, type: 'turning-insert' }, undefined, true)).toBe('turning')
    expect(toolMount(endmill, undefined, false)).toBe('axial')
    expect(holderOf(endmill, lib([endmill]), false)?.id).toBe('generic-bt40')
    expect(holderOf({ ...endmill, type: 'turning-insert' }, lib([]), true)).toBeUndefined()
  })
})

describe('holder against the stock', () => {
  const mill = load(loadMachine(read('configs/machines/mill-3axis.json')))
  const fanucM = load(loadControl(read('configs/controls/fanuc-0i-mf.json')))
  const stock = { shape: 'block' as const, x: 100, y: 80, z: 40 }
  const run = (depth: number) =>
    simulate({ text: ['O0001', 'G21 G90 G17', 'T1 M6', 'S2000 M3', 'G0 X50 Y40 Z5', `G1 Z${depth} F100`, 'G0 Z50', 'M30'].join('\n'), machine: mill, control: fanucM }).moves

  it('flags a plunge deeper than the tool sticks out', () => {
    const hits = findHolderCollisions({ moves: run(-35), tools: lib([endmill]), stock, stockZero: [0, 0, 0], lathe: false })
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ tool: 1, depth: 5, line: 5 })
  })

  it('stays quiet when the holder clears the top', () => {
    expect(findHolderCollisions({ moves: run(-20), tools: lib([endmill]), stock, stockZero: [0, 0, 0], lathe: false })).toEqual([])
  })

  it('finds nothing on the O1500 example as set up', () => {
    const library = load(loadToolLibrary(read('configs/tools/sample-library.json')))
    const moves = simulate({
      text: read('examples/O1500_COROA_ANSI40.nc'),
      machine: load(loadMachine(read('configs/machines/romi-gl250-m.json'))),
      control: load(loadControl(read('configs/controls/fanuc-0i-tf-system-b.json'))),
      tools: library
    }).moves
    const stock = { shape: 'cylinder' as const, diameter: 67.37, length: 30 }
    expect(findHolderCollisions({ moves, tools: library, stock, stockZero: [0, 0, 0], lathe: true })).toEqual([])
    // With 5 mm stick-out the axial holder would hit the face
    const short = { ...library, tools: library.tools.map((t) => ({ ...t, length: 5 })) }
    expect(findHolderCollisions({ moves, tools: short, stock, stockZero: [0, 0, 0], lathe: true }).length).toBeGreaterThan(0)
  })
})
