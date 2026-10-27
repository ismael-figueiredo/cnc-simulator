import { useState } from 'react'
import type { Control, Machine, SetupSuggestion, ToolLibrary } from '@core/index'
import { Dialog } from './Dialog'
import { useI18n } from '../i18n'
import { SetupPicker, type SetupChoice } from './SetupPicker'

interface Props {
  name: string
  machines: Machine[]
  controls: Control[]
  libraries: ToolLibrary[]
  /** Guessed from the program's own codes (and the last choice for that kind of machine). */
  suggestion: SetupSuggestion | null
  onOpen: (choice: SetupChoice) => void
  onCancel: () => void
}

/**
 * A program (.nc) is only G-code: before simulating it, the machine, control and tools are chosen,
 * so it does not open full of alarms for a machine it was not written for.
 */
export function OpenProgramDialog({ name, machines, controls, libraries, suggestion, onOpen, onCancel }: Props) {
  const { t } = useI18n()
  const first = machines.find((m) => m.id === suggestion?.machineId) ?? machines[0]
  const [choice, setChoice] = useState<SetupChoice>({
    machineId: first?.id ?? '',
    controlId: suggestion?.controlId ?? first?.defaultControl ?? '',
    libraryId: first?.defaultTools ?? ''
  })
  return (
    <Dialog
      title={t('openProgram.title')}
      className="open-program"
      header={
        <>
          <span className="muted">{name}</span>
        </>
      }
      footer={
        <>
          <button className="btn" onClick={onCancel}>{t('common.cancel')}</button>
          <button className="btn primary" disabled={!choice.machineId || !choice.controlId} onClick={() => onOpen(choice)}>
            {t('openProgram.open')}
          </button>
        </>
      }
      onClose={onCancel}
    >
      <div className="open-program-body">
        <p className="muted">{t('openProgram.explain')}</p>
        {suggestion && suggestion.evidence.length > 0 && (
          <p className="hint-line">
            {t(suggestion.kind === 'lathe' ? 'openProgram.detectedLathe' : 'openProgram.detectedMill', { codes: suggestion.evidence.join(', ') })}
          </p>
        )}
        <SetupPicker machines={machines} controls={controls} libraries={libraries} value={choice} onChange={setChoice} />
      </div>
    </Dialog>
  )
}
