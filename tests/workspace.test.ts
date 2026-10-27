import { describe, expect, it } from 'vitest'
import { simulate, type Diagnostic, type TemplateTexts } from '../src/core'
import type { BundledConfigs } from '../src/renderer/types'
import { collisionsOf, fixtureHitAt, holderHitAt } from '../src/renderer/collisions'
import { documentStart, templateTexts } from '../src/renderer/documentStart'
import { configIssueText, lineMarks, sortDiagnostics } from '../src/renderer/messages'
import { defaultSetup } from '../src/renderer/project'
import { alarmsOf, simulationInput } from '../src/renderer/simulationInput'
import { alarmConfig, controlConfig, machineConfig, toolConfig } from './helpers/configs'

const gl300 = machineConfig('romi-gl300')
const d600 = machineConfig('romi-d600')
const lathe = controlConfig('fanuc-0i-tf-system-b')
const mill = controlConfig('fanuc-0i-mf')
const cfg: BundledConfigs = {
  machines: [gl300, d600],
  controls: [lathe, mill],
  library: null,
  libraries: [toolConfig('lathe-turning'), toolConfig('machining-center')],
  alarmCatalogs: [alarmConfig('fanuc-0i')],
  issues: []
}
const texts = Object.fromEntries(['newProgram', 'workZero', 'latheZero', 'tool', 'machineHere', 'parameters', 'passes', 'length', 'stepDown', 'totalDepth', 'feed', 'startDiameter', 'finalDiameter'].map((k) => [k, k.toUpperCase()])) as unknown as TemplateTexts

describe('simulation input', () => {
  it("takes the control's alarm catalog and the setup's tables", () => {
    const setup = defaultSetup(gl300, cfg.libraries)
    const input = simulationInput('G0X0', gl300, lathe, cfg.alarmCatalogs, setup, true)
    expect(input.alarms?.id).toBe(lathe.alarms)
    expect(input.tools).toBe(setup.tools)
    expect(input.options).toEqual({ blockDelete: true })
    expect(alarmsOf({ ...lathe, alarms: 'none' }, cfg.alarmCatalogs)).toBeNull()
  })
})

describe('messages', () => {
  const d = (line: number, severity: Diagnostic['severity']): Diagnostic => ({ line, severity, code: 'overtravel' })

  it('puts alarms first and keeps the worst severity per line', () => {
    const sorted = sortDiagnostics([d(5, 'info'), d(2, 'warning'), d(9, 'alarm'), d(2, 'alarm')])
    expect(sorted.map((x) => [x.severity, x.line])).toEqual([['alarm', 2], ['alarm', 9], ['warning', 2], ['info', 5]])
    expect([...lineMarks(sorted)]).toEqual([[2, 'alarm'], [9, 'alarm'], [5, 'info']])
  })

  it('writes a config issue with its source and path', () => {
    const t = (key: string, p?: Record<string, string | number>) => `${key}${JSON.stringify(p ?? {})}`
    expect(configIssueText(t, { kind: 'schema', source: 'm.json', path: 'axes.0', message: 'bad' })).toBe('config.issue{"source":"m.json","path":"axes.0","message":"bad"}')
  })
})

describe('document start', () => {
  it('opens a new program in EDIT, unsaved, with a header for its control', () => {
    const s = documentStart({ kind: 'new', machineId: 'romi-gl300', controlId: lathe.id, programKind: 'plain', number: 12 }, cfg, [], texts)
    expect(s).toMatchObject({ mode: 'edit', dirty: true, projectPath: null, machineId: 'romi-gl300' })
    expect(s.program.name).toBe('O0012.nc')
    expect(s.program.text).toContain('O0012')
  })

  it('opens a program alone in MEM with the chosen library and its offsets', () => {
    const lib = toolConfig('lathe-turning')
    const s = documentStart({ kind: 'program', program: { name: 'a.nc', path: '/a.nc', text: '' }, machineId: 'romi-gl300', controlId: lathe.id, library: lib }, cfg, [], texts)
    expect(s.mode).toBe('mem')
    expect(s.setup.tools).toBe(lib)
    expect(Object.keys(s.setup.toolOffsets).length).toBeGreaterThan(0)
  })

  it('builds the header texts from the UI catalog', () => {
    expect(templateTexts((k) => `<${k}>`).feed).toBe('<template.feed>')
  })
})

describe('collisions', () => {
  it('finds the turret hitting the chuck on a lathe, and nothing to check on a mill', () => {
    const setup = { ...defaultSetup(gl300, cfg.libraries), stock: { shape: 'cylinder' as const, diameter: 50, length: 60 } }
    const text = '%\nO1;\nG21G95;\nT0101;\nG97S800M3;\nG0X40Z2;\nG1Z-70F0.2;\nG0X60;\nM30;\n%'
    const moves = simulate(simulationInput(text, gl300, lathe, cfg.alarmCatalogs, setup)).moves
    const c = collisionsOf(moves, setup, [0, 0, 0], true, gl300)
    expect(c.fixture.length).toBeGreaterThan(0)
    const hit = moves[c.fixture[0]?.moveIndex ?? 0]
    expect(fixtureHitAt(c, hit, 'chuck')).toBe(true)
    expect(fixtureHitAt(c, hit, 'tailstock')).toBe(false)
    expect(holderHitAt(c, undefined)).toBe(false)
    expect(collisionsOf(moves, setup, [0, 0, 0], false, d600).fixture).toEqual([])
  })
})
