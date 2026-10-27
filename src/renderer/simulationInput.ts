import type { AlarmCatalog, Control, Machine, SimulationInput } from '@core/index'
import type { Setup } from './project'

/** The control's alarm catalog among those loaded (control.alarms names it). */
export const alarmsOf = (control: Control, catalogs: readonly AlarmCatalog[]): AlarmCatalog | null => catalogs.find((a) => a.id === control.alarms) ?? null

/** What the interpreter needs to run a program on a machine, a control and a setup. */
export function simulationInput(
  text: string,
  machine: Machine,
  control: Control,
  catalogs: readonly AlarmCatalog[],
  setup: Pick<Setup, 'tools' | 'workOffsets' | 'toolOffsets'>,
  blockSkip = false
): SimulationInput {
  return {
    text,
    machine,
    control,
    tools: setup.tools,
    alarms: alarmsOf(control, catalogs),
    workOffsets: setup.workOffsets,
    toolOffsets: setup.toolOffsets,
    options: { blockDelete: blockSkip }
  }
}
