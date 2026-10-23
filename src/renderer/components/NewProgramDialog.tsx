import { useState } from 'react'
import type { ProgramKind } from '@core/index'
import { useI18n } from '../i18n'

interface Props {
  machine: string
  control: string
  /** The control runs Macro B (variables, IF/WHILE, G65): the parametric option is offered. */
  macro: boolean
  onCreate: (kind: ProgramKind, number: number) => void
  onClose: () => void
}

/** File > New program: plain G-code or parametric, with a header written in the selected control's codes. */
export function NewProgramDialog({ machine, control, macro, onCreate, onClose }: Props) {
  const { t } = useI18n()
  const [kind, setKind] = useState<ProgramKind>('plain')
  const [number, setNumber] = useState(1)
  const valid = Number.isInteger(number) && number >= 1 && number <= 9999

  return (
    <div className="modal-backdrop" role="dialog" aria-modal aria-label={t('newProgram.title')}>
      <div className="modal new-program">
        <header>
          <h2>{t('newProgram.title')}</h2>
        </header>
        <div className="new-program-body">
          <p className="muted">{t('newProgram.for', { machine, control })}</p>
          <div className="kinds" role="radiogroup">
            <button role="radio" aria-checked={kind === 'plain'} className={`kind ${kind === 'plain' ? 'on' : ''}`} onClick={() => setKind('plain')}>
              <b>{t('newProgram.plain')}</b>
              <span>{t('newProgram.plainDetail')}</span>
            </button>
            <button
              role="radio"
              aria-checked={kind === 'parametric'}
              className={`kind ${kind === 'parametric' ? 'on' : ''}`}
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
        <footer>
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" disabled={!valid} onClick={() => onCreate(kind, number)}>{t('newProgram.create')}</button>
        </footer>
      </div>
    </div>
  )
}
