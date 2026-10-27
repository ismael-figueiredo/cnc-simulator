import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadControl, loadMachine, suggestSetup, type Control, type Machine } from '../src/core'
import { load, read, root } from './helpers/configs'

const machines: Machine[] = readdirSync(join(root, 'configs/machines')).map((f) => load(loadMachine(read(`configs/machines/${f}`))))
const controls: Control[] = readdirSync(join(root, 'configs/controls')).map((f) => load(loadControl(read(`configs/controls/${f}`))))
const kindOf = (id: string | undefined) => machines.find((m) => m.id === id)?.kinematics.startsWith('lathe')

describe('machine suggested for a program opened alone', () => {
  it('takes a lathe for lathe programs', () => {
    for (const [f, control] of [
      ['O1001_EIXO_GL300.nc', 'fanuc-0i-tf-system-b'],
      ['O1002_CICLOS_GL300.nc', 'fanuc-0i-tf-system-b'],
      ['O1500_COROA_ANSI40.nc', 'fanuc-21i-tb-system-b']
    ] as const) {
      const s = suggestSetup(read(`examples/${f}`), machines, controls)
      expect(kindOf(s?.machineId), f).toBe(true)
      expect(s?.controlId, f).toBe(control)
    }
  })

  it('takes a lathe with a C axis only when the program uses it', () => {
    expect(suggestSetup(read('examples/O1001_EIXO_GL300.nc'), machines, controls)?.machineId).toBe('romi-gl300')
    // Romi E280 and GL 250 M both have one; the first one in the list is taken
    expect(suggestSetup(read('examples/O1500_COROA_ANSI40.nc'), machines, controls)?.machineId).toBe('romi-e280')
  })

  it('takes a machining center for mill programs, a Haas for Haas programs', () => {
    const fanuc = suggestSetup(read('examples/O2001_PLACA_D600.nc'), machines, controls)
    expect(kindOf(fanuc?.machineId)).toBe(false)
    expect(fanuc?.controlId).not.toBe('haas-ngc-mill')
    const haas = suggestSetup(read('examples/O3001_HAAS_VF2.nc'), machines, controls)
    expect(haas?.controlId).toBe('haas-ngc-mill')
    expect(haas?.evidence).toContain('G154')
  })

  it('keeps the last choice for that kind of machine', () => {
    const s = suggestSetup(read('examples/O1001_EIXO_GL300.nc'), machines, controls, { lathe: { machineId: 'mitsubishi-lathe', controlId: 'mitsubishi-m80-lathe-list3' } })
    expect(s).toMatchObject({ machineId: 'mitsubishi-lathe', controlId: 'mitsubishi-m80-lathe-list3', kind: 'lathe' })
  })

  it('ignores comments', () => {
    const s = suggestSetup('O1 (TORNO G18 T0101)\nG17 G90 G54\nT1 M6\nG43 H1 Z50', machines, controls)
    expect(s?.kind).toBe('mill')
  })
})
