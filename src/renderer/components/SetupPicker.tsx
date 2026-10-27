import { isLathe, type Control, type Machine, type ToolLibrary } from '@core/index'
import { useI18n } from '../i18n'

export interface SetupChoice {
  machineId: string
  controlId: string
  /** Tool library id (bundled or the user's), '' for none. */
  libraryId: string
}

interface Props {
  machines: Machine[]
  controls: Control[]
  /** Offered only when the tool library is part of the choice. */
  libraries?: ToolLibrary[]
  value: SetupChoice
  onChange: (value: SetupChoice) => void
}


/** Machine, control and tool library pickers; controls are limited to the machine's kind. */
export function SetupPicker({ machines, controls, libraries, value, onChange }: Props) {
  const { t, l } = useI18n()
  const machine = machines.find((m) => m.id === value.machineId)
  const kind = isLathe(machine) ? 'lathe' : 'mill'
  const pickMachine = (id: string) => {
    const m = machines.find((x) => x.id === id)
    // A new machine brings its own control and tools
    onChange({ machineId: id, controlId: m?.defaultControl ?? value.controlId, libraryId: m?.defaultTools ?? '' })
  }
  return (
    <div className="setup-picker">
      <label>
        <span>{t('header.machine')}</span>
        <select value={value.machineId} onChange={(e) => pickMachine(e.target.value)}>
          <optgroup label={t('machineGroup.lathe')}>
            {machines.filter(isLathe).map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </optgroup>
          <optgroup label={t('machineGroup.mill')}>
            {machines.filter((m) => !isLathe(m)).map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </optgroup>
        </select>
      </label>
      <label>
        <span>{t('header.control')}</span>
        <select value={value.controlId} onChange={(e) => onChange({ ...value, controlId: e.target.value })}>
          {controls
            .filter((c) => c.machineType === kind)
            .map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
        </select>
      </label>
      {libraries && (
        <label>
          <span>{t('tools.title')}</span>
          <select value={value.libraryId} onChange={(e) => onChange({ ...value, libraryId: e.target.value })}>
            <option value="">{t('tools.noLibrary')}</option>
            {libraries.map((lib) => (
              <option key={lib.id} value={lib.id}>
                {l(lib.name)}
                {lib.id === machine?.defaultTools ? ` · ${t('tools.machineDefault')}` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
