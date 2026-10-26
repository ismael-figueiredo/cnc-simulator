import { useState } from 'react'
import type { AxisName, WorkOffsets } from '@core/index'
import { useI18n } from '../i18n'

interface Props {
  offsets: WorkOffsets
  /** Linear axes of the machine (X Z on a lathe, X Y Z on a mill). */
  axes: AxisName[]
  /** Mills also have the additional offsets G54.1 P1…P48. */
  extended: boolean
  /** keepStock: the stock stays on the table (a changed zero moves the cut); false: it follows the zero. */
  onApply: (offsets: WorkOffsets, keepStock: boolean) => void
  /** The stock's work offset, named in the option. */
  stockOffset: string
  onClose: () => void
}

const STANDARD = ['G54', 'G55', 'G56', 'G57', 'G58', 'G59']

/** The control's WORK OFFSET screen: machine position of each part zero. Empty cells are not set. */
export function WorkOffsetsEditor({ offsets, axes, extended, onApply, onClose, stockOffset }: Props) {
  const { t } = useI18n()
  const [rows, setRows] = useState<WorkOffsets>(() => structuredClone(offsets))
  const [keepStock, setKeepStock] = useState(true)
  const names = [...STANDARD, ...Object.keys(rows).filter((n) => !STANDARD.includes(n)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))]

  function set(name: string, ax: AxisName, value: string) {
    const { [ax]: _old, ...rest } = rows[name] ?? {}
    const row = value === '' ? rest : { ...rest, [ax]: Number(value) }
    const { [name]: _row, ...others } = rows
    setRows(Object.keys(row).length ? { ...others, [name]: row } : others)
  }
  function addExtended() {
    const used = new Set(Object.keys(rows))
    let p = 1
    while (used.has(`G54.1 P${p}`)) p++
    setRows({ ...rows, [`G54.1 P${p}`]: {} })
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal aria-label={t('offsets.title')}>
      <div className="modal offsets-editor">
        <header>
          <h2>{t('offsets.title')}</h2>
        </header>
        <div className="offsets-body">
          <p className="muted">{t('offsets.help')}</p>
          <table className="table offsets">
            <thead>
              <tr>
                <th />
                {axes.map((ax) => (
                  <th key={ax}>{ax}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {names.map((name) => (
                <tr key={name}>
                  <th>{name}</th>
                  {axes.map((ax) => (
                    <td key={ax}>
                      <input
                        type="number"
                        step={0.001}
                        value={rows[name]?.[ax] ?? ''}
                        placeholder="—"
                        aria-label={`${name} ${ax}`}
                        onChange={(e) => set(name, ax, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {extended && (
            <div className="row">
              <button className="btn" onClick={addExtended}>{t('offsets.addExtended')}</button>
            </div>
          )}
          <p className="muted">{t('offsets.impact')}</p>
          <label className="check-row">
            <input type="checkbox" checked={keepStock} onChange={(e) => setKeepStock(e.target.checked)} />
            <span>
              <b>{t('offsets.keepStock', { offset: stockOffset })}</b>
              <br />
              <span className="muted">{t(keepStock ? 'offsets.keepStockOn' : 'offsets.keepStockOff')}</span>
            </span>
          </label>
        </div>
        <footer>
          <button className="btn" onClick={() => setRows({})}>{t('offsets.clear')}</button>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" onClick={() => onApply(rows, keepStock)}>{t('offsets.apply')}</button>
        </footer>
      </div>
    </div>
  )
}
