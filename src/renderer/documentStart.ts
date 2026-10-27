import { programTemplate, type Exercise, type ProgramKind, type Project, type TemplateTexts, type ToolLibrary } from '@core/index'
import type { BundledConfigs, Program } from './types'
import { defaultSetup, offsetsFor, setupFromProject, type Setup } from './project'

/** What a new tab opens: everything the document needs is decided before it is created. */
export type DocInit =
  | { kind: 'project'; program: Program; project: Project; projectPath: string }
  | { kind: 'program'; program: Program; machineId: string; controlId: string; library: ToolLibrary | null }
  | { kind: 'new'; machineId: string; controlId: string; programKind: ProgramKind; number: number }
  | { kind: 'exercise'; id: string }

export interface BundledExercise {
  id: string
  exercise: Exercise
}

/** The document as it opens: program, machine and control, setup, and the screen it starts on. */
export interface DocStart {
  program: Program
  machineId: string
  controlId: string
  setup: Setup
  projectPath: string | null
  /** A new program or an exercise opens in EDIT; files open in MEM, ready to run. */
  mode: 'mem' | 'edit'
  dirty: boolean
  exercise: BundledExercise | null
}

export function documentStart(init: DocInit, cfg: BundledConfigs, exercises: readonly BundledExercise[], texts: TemplateTexts): DocStart {
  if (init.kind === 'project') {
    const m = cfg.machines.find((x) => x.id === init.project.machine) ?? cfg.machines[0]
    const c = cfg.controls.find((x) => x.id === init.project.control) ?? cfg.controls.find((x) => x.id === m?.defaultControl)
    return { program: init.program, machineId: m?.id ?? '', controlId: c?.id ?? '', setup: setupFromProject(init.project, m, cfg.libraries), projectPath: init.projectPath, mode: 'mem', dirty: false, exercise: null }
  }
  if (init.kind === 'program') {
    const m = cfg.machines.find((x) => x.id === init.machineId)
    const base = defaultSetup(m, cfg.libraries)
    const tools = init.library ?? base.tools
    const setup = { ...base, tools, toolOffsets: offsetsFor(tools, m) }
    return { program: init.program, machineId: init.machineId, controlId: init.controlId, setup, projectPath: null, mode: 'mem', dirty: false, exercise: null }
  }
  if (init.kind === 'new') {
    const m = cfg.machines.find((x) => x.id === init.machineId)
    const c = cfg.controls.find((x) => x.id === init.controlId)
    // Header written with the selected control's own codes, in its file format
    const text = m && c ? programTemplate(m, c, init.programKind, init.number, texts) : ''
    const program = { name: `O${String(init.number).padStart(4, '0')}.nc`, path: '', text }
    // A new program starts unsaved, in EDIT, on the machine's own setup
    return { program, machineId: init.machineId, controlId: init.controlId, setup: defaultSetup(m, cfg.libraries), projectPath: null, mode: 'edit', dirty: true, exercise: null }
  }
  const e = exercises.find((x) => x.id === init.id)
  const ex = e?.exercise
  const m = cfg.machines.find((x) => x.id === ex?.machine) ?? cfg.machines[0]
  const base = defaultSetup(m, cfg.libraries)
  const setup: Setup = ex ? { ...base, stock: { ...ex.stock }, workOffsets: ex.workOffsets ?? {} } : base
  const program = { name: `${init.id}.nc`, path: `example:learn/${init.id}.nc`, text: ex?.start ?? '' }
  return { program, machineId: m?.id ?? '', controlId: ex?.control ?? m?.defaultControl ?? '', setup, projectPath: null, mode: 'edit', dirty: false, exercise: e ?? null }
}

const TEMPLATE_KEYS = ['newProgram', 'workZero', 'latheZero', 'tool', 'machineHere', 'parameters', 'passes', 'length', 'stepDown', 'totalDepth', 'feed', 'startDiameter', 'finalDiameter'] as const

/** The comments of a new program's header, in the UI language. */
export function templateTexts(t: (key: `template.${(typeof TEMPLATE_KEYS)[number]}`) => string): TemplateTexts {
  return Object.fromEntries(TEMPLATE_KEYS.map((k) => [k, t(`template.${k}`)])) as unknown as TemplateTexts
}
