import { PROJECT_FORMAT, type Machine, type Project, type Stock, type ToolLibrary, type WorkOffsets } from '@core/index'

/** Everything about the job besides the program: what a .cncsim project saves. */
export interface Setup {
  tools: ToolLibrary | null
  stock: Stock | null
  workOffsets: WorkOffsets
}

export const STOCK_COLOR = '#9aa6b1'

/** The tool library the machine names (defaultTools), else the first bundled one. */
export function defaultTools(machine: Machine | undefined, libraries: ToolLibrary[]): ToolLibrary | null {
  return libraries.find((l) => l.id === machine?.defaultTools) ?? libraries[0] ?? null
}

/** A machine's own stock and default tools, with no work offsets: the setup of a program opened alone. */
export function defaultSetup(machine: Machine | undefined, libraries: ToolLibrary[]): Setup {
  const stock = machine?.defaultStock
  return { tools: defaultTools(machine, libraries), stock: stock ? { ...stock, color: STOCK_COLOR } : null, workOffsets: {} }
}

export function setupFromProject(project: Project, machine: Machine | undefined, libraries: ToolLibrary[]): Setup {
  const fallback = defaultSetup(machine, libraries)
  return {
    tools: project.tools ?? fallback.tools,
    stock: project.stock ?? fallback.stock,
    workOffsets: project.workOffsets ?? {}
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
    ...(Object.keys(setup.workOffsets).length ? { workOffsets: setup.workOffsets } : {})
  }
}
