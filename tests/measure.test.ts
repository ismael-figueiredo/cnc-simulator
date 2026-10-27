import { describe, expect, it } from 'vitest'
import { loadProject, simulate, workZero, type Move, type Project, type Stock } from '../src/core'
import { featuresNear, onProfile, pathPoints, snapMeasure, type MeasurePart } from '../src/renderer/geometry/measure'
import { controlConfig, load, machineConfig, read, toolConfig } from './helpers/configs'

/** An example run to its end, as the measure tool sees it. */
function example(file: string, lathe: boolean): MeasurePart {
  const project: Project = load(loadProject(read(`examples/${file}.cncsim`)))
  const machine = machineConfig(project.machine)
  // The tools the app opens it with: the project's own, else the machine's default library
  const tools = project.tools ?? (machine.defaultTools ? toolConfig(machine.defaultTools) : null)
  const moves: Move[] = simulate({ text: read(`examples/${project.program}`), machine, control: controlConfig(project.control), tools, workOffsets: project.workOffsets }).moves
  // Without a stock of its own the project uses the machine's, as the app does
  const stock = (project.stock ?? machine.defaultStock) as Stock
  return { moves, index: moves.length - 1, stock, zero: workZero(project.workOffsets ?? {}, stock.workOffset ?? 'G54', lathe), lathe, ballTools: new Set(), radialTools: new Set() }
}

describe('measuring the plate (O2001)', () => {
  const part = example('O2001_PLACA_D600', false)
  const at = (x: number, y: number, z: number) => snapMeasure({ part }, part, [x, y, z], 1.5, [])

  it('snaps to the centers of the drilled holes, on the face', () => {
    const s = at(15.4, 15.3, 0.2)
    expect(s.kind).toBe('center')
    expect(s.point.map((v) => Math.round(v * 10) / 10)).toEqual([15, 15, 0])
  })

  it('snaps to the top and the floor edge of the pocket wall', () => {
    const top = at(60, 25.6, 0)
    expect(top.kind).toBe('edge')
    expect(Math.round(top.point[1])).toBe(25)
    expect(Math.round(top.point[2])).toBe(0)
    const floor = at(60, 25.6, -5.6)
    expect(floor.kind).toBe('edge')
    expect(Math.round(floor.point[2])).toBe(-6)
  })

  it('sees no corner where the end mill left the pocket corner round', () => {
    const f = featuresNear({ part }, part, [40.5, 25.5, 0], 3)
    expect(f.vertices.filter((v) => Math.hypot(v[0] - 40, v[1] - 25) < 3)).toEqual([])
  })
})

describe('measuring the stepped shaft (O1001)', () => {
  const part = example('O1001_EIXO_GL300', true)

  it('snaps to the shoulder corner at the angle that was clicked', () => {
    const s = snapMeasure({ part }, part, [0, 20.3, -49.6], 1, [])
    expect(s.kind).toBe('vertex')
    expect(Math.round(Math.hypot(s.point[0], s.point[1]))).toBe(20)
    expect(Math.round(s.point[2])).toBe(-50)
    expect(Math.abs(s.point[0])).toBeLessThan(1e-6)
  })

  it('snaps to the face center on the axis', () => {
    expect(snapMeasure({ part }, part, [0.4, 0.3, 0], 1, [])).toMatchObject({ kind: 'center', point: [0, 0, expect.closeTo(0, 3) as number] })
  })
})

describe('lathe measurements', () => {
  it('are taken on the profile, whichever side of the bar each point was clicked on', () => {
    const [a, b] = onProfile([[0, 16, -10], [-20, 0, -50]])
    expect(a?.map((v) => Math.round(v * 1e9) / 1e9)).toEqual([0, 16, -10])
    expect(b?.map((v) => Math.round(v * 1e9) / 1e9)).toEqual([0, 20, -50])
  })
})

describe('measuring a bar cut with live tools (O1500)', () => {
  const part = example('O1500_COROA_ANSI40', true)

  it('snaps to the outer edge of the face, at the angle clicked', () => {
    const s = snapMeasure({ part }, part, [33.4, 0.5, 0.3], 1, [])
    expect(s.kind).toBe('vertex')
    expect(Math.round(Math.hypot(s.point[0], s.point[1]) * 2)).toBe(67)
  })

  it('finds features of the milled face map too', () => {
    const f = featuresNear({ part }, part, [20, 0, 0], 3)
    expect(f.edges.length).toBeGreaterThan(0)
  })
})

describe('snapping without a part', () => {
  it('falls back to the path, then the point itself', () => {
    const path = pathPoints(new Float32Array([0, 0, 0, 10, 0, 0]))
    expect(path).toEqual([[0, 0, 0], [10, 0, 0]])
    expect(snapMeasure({}, null, [9.7, 0, 0], 0.5, path)).toEqual({ point: [10, 0, 0], kind: 'path' })
    expect(snapMeasure({}, null, [5, 0, 0], 0.5, path)).toEqual({ point: [5, 0, 0], kind: 'surface' })
  })
})
