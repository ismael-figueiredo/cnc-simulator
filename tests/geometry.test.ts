import { describe, expect, it } from 'vitest'
import { BufferAttribute, BufferGeometry, Uint32BufferAttribute } from 'three'
import { createHeightfield, createProfile, type Move, type Vec3 } from '../src/core'
import { barGeometry, copyProfile, holeGeometry, replayTo, seatHole, writeCells } from '../src/renderer/geometry/machined'
import { buildLayer, rotateZ, toScene } from '../src/renderer/geometry/paths'

const move = (points: Vec3[], kind: Move['kind'] = 'feed'): Move => ({ kind, line: 0, points, durationS: 1, toolRadius: 1 }) as unknown as Move

describe('path layers', () => {
  it('puts every segment of the picked moves in one buffer, with where each move starts', () => {
    const moves = [move([[0, 0, 0], [1, 0, 0], [1, 1, 0]]), move([[1, 1, 0], [5, 5, 5]], 'rapid'), move([[2, 2, 2], [3, 3, 3]])]
    const layer = buildLayer(moves, (m) => (m.kind === 'feed' ? m.points : undefined))
    expect([...layer.starts]).toEqual([0, 4, 4, 6])
    expect(layer.positions.length).toBe(6 * 3)
  })

  it('draws machine Z up on mills and turns points around Z', () => {
    expect(toScene([1, 2, 3], false)).toEqual([1, 3, -2])
    expect(toScene([1, 2, 3], true)).toEqual([1, 2, 3])
    expect(rotateZ([1, 0, 5], Math.PI / 2).map((v) => Math.round(v * 1e9) / 1e9)).toEqual([0, 1, 5])
  })
})

describe('replay of the cuts', () => {
  // A counter as the "model": each move adds its index, so the state shows which moves were applied
  const moves = Array.from({ length: 1200 }, (_, k) => move([[k, 0, 0]]))
  const apply = (m: { sum: number }, mv: Move) => {
    m.sum += mv.points[0]?.[0] ?? 0
    return true
  }
  const run = (key: object, index: number) => replayTo(key, () => ({ sum: 0 }), (m) => ({ ...m }), apply, moves, index)
  const sumTo = (n: number) => (n * (n + 1)) / 2

  it('applies moves forward and restarts from a checkpoint when going back', () => {
    const key = {}
    expect(run(key, 999).model.sum).toBe(sumTo(999))
    const back = run(key, 600)
    expect(back.applied).toBe(600)
    expect(back.model.sum).toBe(sumTo(600))
    expect(back.checkpoints.length).toBeGreaterThan(0)
  })

  it('starts a new key from the raw model', () => {
    run({}, 50)
    expect(run({}, 3).model.sum).toBe(sumTo(3))
  })

  it('copies profiles without sharing their radii', () => {
    const p = createProfile({ shape: 'cylinder', diameter: 40, length: 20 }, [0, 0, 0])
    const c = copyProfile(p)
    c.radii[0] = 1
    expect(p.radii[0]).toBe(20)
  })
})

describe('machined meshes', () => {
  const block = { shape: 'block' as const, x: 20, y: 20, z: 10 }

  it('writes a flat field as a flat surface, normals up', () => {
    const h = createHeightfield(block, [0, 0, 0])
    const g = new BufferGeometry()
    for (const name of ['position', 'normal', 'color']) g.setAttribute(name, new BufferAttribute(new Float32Array(h.nx * h.ny * 3), 3))
    g.setIndex(new Uint32BufferAttribute(new Uint32Array((h.nx - 1) * (h.ny - 1) * 6), 1))
    writeCells(g, h, [0, 0, h.nx - 1, h.ny - 1], '#9aa6b1')
    const nor = g.getAttribute('normal')
    expect([nor.getX(5), nor.getY(5), nor.getZ(5)]).toEqual([-0, -0, 1])
    expect(g.getAttribute('position').getZ(5)).toBe(0)
  })

  it('seats a drilled hole at its bottom and draws its wall and rim', () => {
    const h = createHeightfield(block, [0, 0, 0])
    const hole = { x: 10, y: 10, radius: 2, bottom: -6, last: 0 }
    const floor = new Float32Array(h.nx * h.ny).fill(Infinity)
    seatHole(floor, h, hole)
    const center = Math.round((10 - h.y0) / h.cell) * h.nx + Math.round((10 - h.x0) / h.cell)
    expect(floor[center]).toBe(-6)
    const { walls, rims } = holeGeometry([hole], h, '#9aa6b1')
    expect(walls.getAttribute('position').count).toBeGreaterThan(0)
    expect(rims.getAttribute('position').count).toBe(walls.getAttribute('position').count)
  })

  it('turns the bar profile into a closed solid, colored by cut and raw stock', () => {
    const p = createProfile({ shape: 'cylinder', diameter: 40, length: 20 }, [0, 0, 0])
    p.radii.fill(15, 0, 10)
    const g = barGeometry(p, '#9aa6b1')
    const colors = g.getAttribute('color')
    expect(colors.count).toBe(g.getAttribute('position').count)
    const distinct = new Set(Array.from({ length: colors.count }, (_, k) => colors.getX(k).toFixed(3)))
    expect(distinct.size).toBe(2)
  })
})
