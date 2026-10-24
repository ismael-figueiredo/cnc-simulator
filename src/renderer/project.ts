import { defaultToolOffsets, PROJECT_FORMAT, type Machine, type Project, type Stock, type ToolLibrary, type ToolOffsets, type WorkOffsets } from '@core/index'

/** Everything about the job besides the program: what a .cncsim project saves. */
export interface Setup {
  tools: ToolLibrary | null
  stock: Stock | null
  workOffsets: WorkOffsets
  /** The control's tool offset table (H/D or lathe geometry and wear). */
  toolOffsets: ToolOffsets
}

const isLathe = (machine: Machine | undefined) => !!machine?.kinematics.startsWith('lathe')

/**
 * Offsets for a tool set: the ones already set are kept (they may hold edits, or deliberate mistakes
 * to try out), and offset numbers not in the table yet are measured from the tools.
 */
export function offsetsFor(tools: ToolLibrary | null, machine: Machine | undefined, current: ToolOffsets = {}): ToolOffsets {
  return { ...defaultToolOffsets(tools, isLathe(machine)), ...current }
}

export const STOCK_COLOR = '#9aa6b1'

/** The tool library the machine names (defaultTools), else the first bundled one. */
export function defaultTools(machine: Machine | undefined, libraries: ToolLibrary[]): ToolLibrary | null {
  return libraries.find((l) => l.id === machine?.defaultTools) ?? libraries[0] ?? null
}

/** A machine's own stock and default tools, with no work offsets: the setup of a program opened alone. */
export function defaultSetup(machine: Machine | undefined, libraries: ToolLibrary[]): Setup {
  const stock = machine?.defaultStock
  const tools = defaultTools(machine, libraries)
  return { tools, stock: stock ? { ...stock, color: STOCK_COLOR } : null, workOffsets: {}, toolOffsets: offsetsFor(tools, machine) }
}

export function setupFromProject(project: Project, machine: Machine | undefined, libraries: ToolLibrary[]): Setup {
  const fallback = defaultSetup(machine, libraries)
  const tools = project.tools ?? fallback.tools
  return {
    tools,
    stock: project.stock ?? fallback.stock,
    workOffsets: project.workOffsets ?? {},
    toolOffsets: offsetsFor(tools, machine, project.toolOffsets)
  }
}

/** Project fields as written to the file; `program` (and `programText` in the browser) is added by the caller. */
export function projectData(machineId: string, controlId: string, setup: Setup): Omit<Project, 'program'> {
  return {
    format: PROJECT_FORMAT,
    version: 1,
    machine: machineId,
    control: controlId,
    ...(setup.tools ? { tools: setup.tools } : {}),
    ...(setup.stock ? { stock: setup.stock } : {}),
    ...(Object.keys(setup.workOffsets).length ? { workOffsets: setup.workOffsets } : {}),
    ...(Object.keys(setup.toolOffsets).length ? { toolOffsets: setup.toolOffsets } : {})
  }
}
