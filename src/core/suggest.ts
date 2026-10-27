// Guesses the machine kind and control family a program was written for, so a program opened alone
// starts on a sensible machine instead of whichever one happened to be selected.
import { machineKind, type MachineKind } from './config/kinds'
import type { Control, Machine } from './config/schema'


export interface SetupSuggestion {
  machineId: string
  controlId: string
  kind: MachineKind
  /** Words that decided it, to show next to the choice (e.g. "G18", "T0101", "G154"). */
  evidence: string[]
}

/** A previous choice, per machine kind, used when it fits what the program looks like. */
export type LastChoice = Partial<Record<MachineKind, { machineId: string; controlId: string }>>


// Signs of each kind; each found sign adds its weight
const LATHE_SIGNS: [RegExp, string, number][] = [
  [/(?<![A-Z])G0?18(?!\d)/, 'G18', 2],
  [/(?<![A-Z#])T\d{4}(?!\d)/, 'T0101', 2],
  [/(?<![A-Z])G(?:96|97)(?!\d)/, 'G96/G97', 1],
  [/(?<![A-Z])G7[0-3](?!\d)[^\n]*P\d/, 'G70–G73', 2],
  [/(?<![A-Z,])[UW]-?\d/, 'U/W', 1]
]
const MILL_SIGNS: [RegExp, string, number][] = [
  [/(?<![A-Z])G17(?!\d)/, 'G17', 2],
  [/(?<![A-Z])G4[34](?!\d)/, 'G43', 2],
  [/(?<![A-Z])M0?6(?!\d)/, 'M06', 2],
  [/(?<![A-Z#])Y-?[\d.]/, 'Y', 1],
  [/(?<![A-Z])G8[1-9](?!\d)[^\n]*R-?[\d.]/, 'G81–G89', 1]
]
const HAAS_SIGNS = /(?<![A-Z])(G154|G1[12]\d|G187|G103|M97)(?![\d.])/

export function suggestSetup(text: string, machines: readonly Machine[], controls: readonly Control[], last: LastChoice = {}): SetupSuggestion | null {
  // Comments say nothing about the machine
  const code = text.toUpperCase().replace(/\([^)\n]*\)?/g, ' ')
  const evidence: string[] = []
  const score = (signs: [RegExp, string, number][]) =>
    signs.reduce((sum, [re, label, w]) => {
      if (!re.test(code)) return sum
      evidence.push(label)
      return sum + w
    }, 0)
  const lathe = score(LATHE_SIGNS)
  const mill = score(MILL_SIGNS)
  const haas = HAAS_SIGNS.exec(code)?.[1]
  const kind: MachineKind = haas ? 'mill' : lathe > mill ? 'lathe' : 'mill'
  if (haas) evidence.push(haas)

  const familyOf = (id: string | undefined) => controls.find((c) => c.id === id)?.family
  // Without Haas codes, Fanuc is the most common dialect (Mitsubishi reads it too)
  const family = haas ? 'haas' : 'fanuc'
  const fits = (m: Machine) => machineKind(m) === kind && familyOf(m.defaultControl) === family
  const prev = last[kind]
  const prevMachine = prev && machines.find((m) => m.id === prev.machineId)
  // The last choice wins when it is the right kind of machine (any family: the user picked it)
  if (prev && prevMachine && machineKind(prevMachine) === kind && (!haas || familyOf(prev.controlId) === 'haas') && controls.some((c) => c.id === prev.controlId))
    return { machineId: prev.machineId, controlId: prev.controlId, kind, evidence }
  // A lathe with a C axis (live tooling) only for programs that use C or polar interpolation
  const usesC = kind === 'lathe' && /(?<![A-Z,#])C-?[\d.]|G12\.1|G112(?!\d)/.test(code)
  if (usesC) evidence.push('C')
  const hasC = (m: Machine) => m.axes.some((a) => a.name === 'C')
  const machine = machines.find((m) => fits(m) && (kind !== 'lathe' || hasC(m) === usesC)) ?? machines.find(fits) ?? machines.find((m) => machineKind(m) === kind)
  if (!machine) return null
  const control = controls.find((c) => c.id === machine.defaultControl) ?? controls.find((c) => c.machineType === kind)
  return control ? { machineId: machine.id, controlId: control.id, kind, evidence } : null
}
