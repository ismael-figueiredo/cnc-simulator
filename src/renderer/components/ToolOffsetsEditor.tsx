import { useState } from 'react'
import type { ToolOffset, ToolOffsets } from '@core/index'
import type { MessageKey } from '@i18n/index'
import { useI18n } from '../i18n'

interface Props {
  offsets: ToolOffsets
  /** The table measured from the tools, for "Measure from tools". */
  measured: ToolOffsets
  lathe: boolean
  onApply: (offsets: ToolOffsets) => void
  onClose: () => void
}

type Column = { key: keyof ToolOffset; label: MessageKey; step: number }

// The columns of the control's OFFSET screen
const MILL: Column[] = [
  { key: 'length', label: 'toolOffsets.length', step: 0.001 },
  { key: 'lengthWear', label: 'toolOffsets.wear', step: 0.001 },
  { key: 'radius', label: 'toolOffsets.radius', step: 0.001 },
  { key: 'radiusWear', label: 'toolOffsets.wear', step: 0.001 }
]
const LATHE: Column[] = [
  { key: 'x', label: 'toolOffsets.x', step: 0.001 },
  { key: 'z', label: 'toolOffsets.z', step: 0.001 },
  { key: 'nose', label: 'toolOffsets.nose', step: 0.001 },
  { key: 'tip', label: 'toolOffsets.tip', step: 1 },
  { key: 'xWear', label: 'toolOffsets.xWear', step: 0.001 },
  { key: 'zWear', label: 'toolOffsets.zWear', step: 0.001 },
  { key: 'noseWear', label: 'toolOffsets.noseWear', step: 0.001 }
]

/** Tool offset table: what G43 H, G41/G42 D and the lathe T word read during the simulation. */
export function ToolOffsetsEditor({ offsets, measured, lathe, onApply, onClose }: Props) {
  const { t } = useI18n()
  const [rows, setRows] = useState<ToolOffsets>(() => structuredClone(offsets))
  const columns = lathe ? LATHE : MILL
  const numbers = Object.keys(rows).sort((a, b) => Number(a) - Number(b))

  function set(n: string, key: keyof ToolOffset, value: string) {
    const { [key]: _old, ...rest } = rows[n] ?? {}
    setRows({ ...rows, [n]: value === '' ? rest : { ...rest, [key]: key === 'tip' ? Math.round(Number(value)) : Number(value) } })
  }
  function add() {
    const next = String(Math.max(0, ...numbers.map(Number)) + 1)
    setRows({ ...rows, [next]: {} })
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal aria-label={t('toolOffsets.title')}>
      <div className="modal offsets-editor tool-offsets">
        <header>
          <h2>{t('toolOffsets.title')}</h2>
        </header>
        <div className="offsets-body">
          <p className="muted">{t(lathe ? 'toolOffsets.helpLathe' : 'toolOffsets.helpMill')}</p>
          <table className="table offsets">
            <thead>
              <tr>
                <th>{t('toolOffsets.number')}</th>
                {columns.map((c, i) => (
                  <th key={`${c.key}${i}`}>{t(c.label)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {numbers.map((n) => (
                <tr key={n}>
                  <th>{n.padStart(2, '0')}</th>
                  {columns.map((c) => (
                    <td key={c.key}>
                      <input
                        type="number"
                        step={c.step}
                        min={c.key === 'tip' ? 0 : undefined}
                        max={c.key === 'tip' ? 9 : undefined}
                        value={rows[n]?.[c.key] ?? ''}
                        placeholder="—"
                        aria-label={`${n} ${t(c.label)}`}
                        onChange={(e) => set(n, c.key, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            <button className="btn" onClick={add}>{t('toolOffsets.add')}</button>
          </div>
        </div>
        <footer>
          <button className="btn" title={t('toolOffsets.measureHint')} onClick={() => setRows(structuredClone(measured))}>
            {t('toolOffsets.measure')}
          </button>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" onClick={() => onApply(rows)}>{t('offsets.apply')}</button>
        </footer>
      </div>
    </div>
  )
}
