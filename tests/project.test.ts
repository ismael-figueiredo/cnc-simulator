import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadProject, PROJECT_FORMAT, type Project } from '../src/core'

const library = JSON.parse(readFileSync(join(__dirname, '..', 'configs', 'tools', 'sample-library.json'), 'utf8')) as unknown

const base: Project = {
  format: PROJECT_FORMAT,
  version: 1,
  program: 'O1500_COROA_ANSI40.nc',
  machine: 'romi-gl250-m',
  control: 'fanuc-0i-tf-system-b'
}

describe('project file', () => {
  it('loads a minimal project', () => {
    const r = loadProject(JSON.stringify(base))
    expect(r.ok).toBe(true)
  })

  it('loads stock, work offsets and embedded tools', () => {
    const r = loadProject({
      ...base,
      tools: library,
      stock: { shape: 'cylinder', diameter: 80, length: 40, color: '#c8a24a', offset: { Z: 2 }, workOffset: 'G54' },
      workOffsets: { G54: { X: 0, Z: -350.5 }, G55: { Z: -420 }, 'G54.1 P12': { X: 10, Y: 5, Z: -300 } }
    })
    expect(r.ok ? [] : r.issues).toEqual([])
  })

  it('rejects another JSON file and names the bad fields', () => {
    const r = loadProject({ id: 'romi-gl250-m', name: 'Romi GL 250 M' }, 'romi.cncsim')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues.map((i) => i.path)).toEqual(expect.arrayContaining(['format', 'program', 'machine']))
  })

  it('rejects unknown work offsets and bad colors', () => {
    const r = loadProject({ ...base, stock: { shape: 'block', color: 'red' }, workOffsets: { G60: { X: 1 } } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues.map((i) => i.path)).toEqual(expect.arrayContaining(['stock.color', 'workOffsets.G60']))
  })

  it('reports broken JSON instead of throwing', () => {
    const r = loadProject('{ "format": ', 'broken.cncsim')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues[0]?.kind).toBe('invalid-json')
  })
})
