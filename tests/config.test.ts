import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadControl, loadMachine, loadToolLibrary, setValidationLanguage } from '../src/core'

const dir = (p: string) => join(__dirname, '..', 'configs', p)
const jsonFiles = (p: string) => readdirSync(dir(p)).filter((f) => f.endsWith('.json'))
const read = (p: string, f: string) => readFileSync(join(dir(p), f), 'utf8')

describe('bundled configs', () => {
  it.each(jsonFiles('machines'))('machine %s is valid', (f) => {
    const r = loadMachine(read('machines', f), f)
    expect(r.ok ? [] : r.issues).toEqual([])
  })

  it.each(jsonFiles('controls'))('control %s is valid', (f) => {
    const r = loadControl(read('controls', f), f)
    expect(r.ok ? [] : r.issues).toEqual([])
  })

  it.each(jsonFiles('tools'))('tool library %s is valid', (f) => {
    const r = loadToolLibrary(read('tools', f), f)
    expect(r.ok ? [] : r.issues).toEqual([])
  })

  it('every machine points to an existing control', () => {
    const ids = new Set(jsonFiles('controls').map((f) => (JSON.parse(read('controls', f)) as { id: string }).id))
    for (const f of jsonFiles('machines')) expect(ids).toContain((JSON.parse(read('machines', f)) as { defaultControl: string }).defaultControl)
  })
})

describe('config issues', () => {
  const broken = { id: 'x', name: 'x', type: 'lathe', kinematics: 'lathe-xz', axes: [], spindles: [], toolChangePosition: {}, defaultControl: 'y' }

  afterEach(() => setValidationLanguage('en'))

  it('report the field path', () => {
    const r = loadMachine(broken)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues.map((i) => i.path)).toContain('axes')
  })

  it('report invalid JSON text', () => {
    const r = loadMachine('{ not json', 'bad.json')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.issues[0]).toMatchObject({ kind: 'invalid-json', source: 'bad.json' })
  })

  it('follow the validation language', () => {
    setValidationLanguage('en')
    const en = loadMachine(broken)
    setValidationLanguage('pt-BR')
    const pt = loadMachine(broken)
    expect(en.ok || pt.ok).toBe(false)
    if (!en.ok && !pt.ok) expect(pt.issues[0]?.message).not.toBe(en.issues[0]?.message)
  })
})
