import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  loadAlarmCatalog,
  loadControl,
  loadMachine,
  programTemplate,
  simulate,
  type ProgramKind,
  type TemplateTexts
} from '../src/core'
import { controlConfig, load, read, root } from './helpers/configs'


const texts: TemplateTexts = {
  newProgram: 'Novo programa',
  workZero: 'Zero peça',
  latheZero: 'Zero peça: face, Z0',
  tool: 'Ferramenta',
  machineHere: 'Usinagem aqui',
  parameters: 'Parâmetros - altere aqui',
  passes: 'Passes até a profundidade',
  length: 'Comprimento',
  stepDown: 'Profundidade por passe',
  totalDepth: 'Profundidade total',
  feed: 'Avanço',
  startDiameter: 'Diâmetro inicial',
  finalDiameter: 'Diâmetro final'
}

const machines = readdirSync(join(root, 'configs/machines')).map((f) => load(loadMachine(read(`configs/machines/${f}`))))
const cases = machines.flatMap((m) => (['plain', 'parametric'] as ProgramKind[]).map((k) => [m.id, k] as const))

describe('new program templates', () => {
  it.each(cases)('%s %s runs without alarms on its default control', (id, kind) => {
    const machine = machines.find((m) => m.id === id)
    if (!machine) throw new Error(id)
    const control = load(loadControl(read(`configs/controls/${machine.defaultControl}.json`)))
    const alarms = control.alarms ? load(loadAlarmCatalog(read(`configs/alarms/${control.alarms}.json`))) : null
    const text = programTemplate(machine, control, kind, 1, texts)
    const r = simulate({ text, machine, control, alarms })
    expect(r.diagnostics.filter((d) => d.severity === 'alarm').map((d) => `${d.code} L${d.line + 1}: ${text.split('\n')[d.line]}`)).toEqual([])
    expect(r.finished).toBe(true)
    if (kind === 'parametric') expect(r.moves.filter((m) => m.kind === 'feed').length).toBeGreaterThanOrEqual(3)
  })

  it('writes ASCII comments and the control EOB', () => {
    const machine = machines.find((m) => m.id === 'romi-gl250-m')
    if (!machine) throw new Error('romi-gl250-m')
    const control = controlConfig('fanuc-0i-tf-system-b')
    const text = programTemplate(machine, control, 'parametric', 25, texts)
    expect(text).toContain('O0025 (NOVO PROGRAMA);')
    expect(text).toContain('(PARAMETROS - ALTERE AQUI);')
    expect(text).toContain('WHILE[#110 GT #103] DO1;')
  })
})
