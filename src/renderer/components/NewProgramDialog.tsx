import { useState } from 'react'
import { supportsMacro, type Control, type Machine, type ProgramKind } from '@core/index'
import { Dialog } from './Dialog'
import { useI18n } from '../i18n'
import { SetupPicker, type SetupChoice } from './SetupPicker'

interface Props {
  machines: Machine[]
  controls: Control[]
  /** Machine and control offered first (the last ones used). */
  initial: SetupChoice
  onCreate: (kind: ProgramKind, number: number, choice: SetupChoice) => void
  onClose: () => void
}

/** File > New program: machine and control, then plain G-code or parametric, with a header in that control's codes. */
export function NewProgramDialog({ machines, controls, initial, onCreate, onClose }: Props) {
  const { t } = useI18n()
  const [kind, setKind] = useState<ProgramKind>('plain')
  const [number, setNumber] = useState(1)
  const [choice, setChoice] = useState<SetupChoice>(initial)
  const control = controls.find((c) => c.id === choice.controlId)
  // The control runs Macro B (variables, IF/WHILE, G65): the parametric option is offered
  const macro = !!control && supportsMacro(control)
  const valid = Number.isInteger(number) && number >= 1 && number <= 9999 && !!control

  return (
    <Dialog
      title={t('newProgram.title')}
      className="new-program"
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" disabled={!valid} onClick={() => onCreate(macro ? kind : 'plain', number, choice)}>{t('newProgram.create')}</button>
        </>
      }
      onClose={onClose}
    >
      <div className="new-program-body">
        <SetupPicker machines={machines} controls={controls} value={choice} onChange={setChoice} />
        <p className="muted">{t('newProgram.forControl')}</p>
        <div className="kinds" role="radiogroup">
          <button role="radio" aria-checked={kind === 'plain'} className={`kind ${kind === 'plain' ? 'on' : ''}`} onClick={() => setKind('plain')}>
            <b>{t('newProgram.plain')}</b>
            <span>{t('newProgram.plainDetail')}</span>
          </button>
          <button
            role="radio"
            aria-checked={kind === 'parametric' && macro}
            className={`kind ${kind === 'parametric' && macro ? 'on' : ''}`}
            disabled={!macro}
            onClick={() => setKind('parametric')}
          >
            <b>{t('newProgram.parametric')}</b>
            <span>{macro ? t('newProgram.parametricDetail') : t('newProgram.noMacro')}</span>
          </button>
        </div>
        <label>
          <span>{t('newProgram.number')}</span>
          <input type="number" min={1} max={9999} step={1} value={number} onChange={(e) => setNumber(Number(e.target.value))} />
        </label>
      </div>
    </Dialog>
  )
}
