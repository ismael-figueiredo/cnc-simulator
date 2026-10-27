import type { Control, Machine } from './schema'

export type MachineKind = 'lathe' | 'mill'

/** Lathes ("lathe-2axis", "lathe-c", "lathe-cy"…) turn the part; everything else is a machining center. */
export const isLathe = (machine: Machine | undefined): boolean => !!machine?.kinematics.startsWith('lathe')

export const machineKind = (machine: Machine): MachineKind => (isLathe(machine) ? 'lathe' : 'mill')

/** A lathe control: X as a diameter, G18, T with its offset number. */
export const isLatheControl = (control: Control): boolean => control.machineType === 'lathe'
