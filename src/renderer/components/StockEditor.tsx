import { useState, type ReactNode } from 'react'
import { offsetForZero, type AxisName, type Stock, type ZeroAt } from '@core/index'
import { useI18n } from '../i18n'
import { STOCK_COLOR } from '../project'

interface Props {
  stock: Stock | null
  /** The machine's own stock, for "Machine default". */
  machineDefault: Stock | null
  lathe: boolean
  /** Stock wrapping what the program cuts, or null when it cuts nothing. */
  fromProgram: Stock | null
  /** Work offsets to attach the stock to (G54 is always offered). */
  workOffsets: string[]
  onApply: (stock: Stock) => void
  onClose: () => void
}

/** Common materials, so the stock reads at a glance in the 3D view. */
const MATERIALS = [
  { id: 'steel', color: STOCK_COLOR },
  { id: 'aluminium', color: '#d3dae1' },
  { id: 'brass', color: '#c8a24a' },
  { id: 'bronze', color: '#a8713a' },
  { id: 'copper', color: '#c06a45' },
  { id: 'nylon', color: '#ece6d6' },
  { id: 'pom', color: '#2d3236' }
] as const

const STANDARD_OFFSETS = ['G54', 'G55', 'G56', 'G57', 'G58', 'G59']

const ZERO_AT: ZeroAt[] = ['front-left', 'front-right', 'back-left', 'back-right', 'center']

export function StockEditor({ stock, machineDefault, lathe, fromProgram, workOffsets, onApply, onClose }: Props) {
  const { t } = useI18n()
  const [s, setS] = useState<Stock>(() => stock ?? machineDefault ?? { shape: lathe ? 'cylinder' : 'block', diameter: 60, length: 50, x: 100, y: 80, z: 30 })
  const offsets = [...new Set([...STANDARD_OFFSETS, ...workOffsets])]
  const axes: AxisName[] = lathe ? ['Z'] : ['X', 'Y', 'Z']
  const valid = s.shape === 'cylinder' ? (s.diameter ?? 0) > 0 && (s.length ?? 0) > 0 : (s.x ?? 0) > 0 && (s.y ?? 0) > 0 && (s.z ?? 0) > 0

  const size = (key: 'diameter' | 'length' | 'x' | 'y' | 'z', label: string): ReactNode => (
    <label>
      <span>{label}</span>
      <input type="number" min={0} step={0.1} value={s[key] ?? ''} onChange={(e) => setS({ ...s, [key]: e.target.value === '' ? undefined : Number(e.target.value) })} />
    </label>
  )

  return (
    <div className="modal-backdrop" role="dialog" aria-modal aria-label={t('stock.title')}>
      <div className="modal stock-editor">
        <header>
          <h2>{t('stock.title')}</h2>
          <span className="spacer" />
          <button
            className="btn"
            disabled={!fromProgram}
            title={t(fromProgram ? 'stock.fromProgramHint' : 'stock.noProgram')}
            onClick={() => fromProgram && setS({ ...fromProgram, color: s.color, workOffset: s.workOffset })}
          >
            {t('stock.fromProgram')}
          </button>
          {machineDefault && (
            <button className="btn" onClick={() => setS({ ...machineDefault, color: s.color })}>
              {t('stock.machineDefault')}
            </button>
          )}
        </header>
        <div className="stock-body">
          <label>
            <span>{t('stock.shape')}</span>
            <select value={s.shape} onChange={(e) => setS({ ...s, shape: e.target.value === 'block' ? 'block' : 'cylinder' })}>
              <option value="cylinder">{t('stock.cylinder')}</option>
              <option value="block">{t('stock.block')}</option>
            </select>
          </label>
          <div className="fields">
            {s.shape === 'cylinder' ? (
              <>
                {size('diameter', t('stock.diameter'))}
                {size('length', t('stock.length'))}
              </>
            ) : (
              <>
                {size('x', t('stock.sizeX'))}
                {size('y', t('stock.sizeY'))}
                {size('z', t('stock.sizeZ'))}
              </>
            )}
          </div>

          <h3>{t('stock.position')}</h3>
          <p className="muted">{t(s.shape === 'cylinder' ? 'stock.cylinderOrigin' : 'stock.blockOrigin')}</p>
          {s.shape === 'block' && (
            <label className="zero-at">
              <span>{t('stock.zeroAt')}</span>
              <select
                value={ZERO_AT.find((z) => {
                  const o = offsetForZero(s, z)
                  return Math.abs((s.offset?.X ?? 0) - (o.X ?? 0)) < 1e-6 && Math.abs((s.offset?.Y ?? 0) - (o.Y ?? 0)) < 1e-6 && Math.abs(s.offset?.Z ?? 0) < 1e-6
                }) ?? 'custom'}
                onChange={(e) => {
                  const at = ZERO_AT.find((z) => z === e.target.value)
                  if (at) setS({ ...s, offset: offsetForZero(s, at) })
                }}
              >
                {ZERO_AT.map((z) => (
                  <option key={z} value={z}>{t(`zeroAt.${z}`)}</option>
                ))}
                <option value="custom" disabled>{t('zeroAt.custom')}</option>
              </select>
            </label>
          )}
          <div className="fields">
            <label>
              <span>{t('stock.workOffset')}</span>
              <select value={s.workOffset ?? 'G54'} onChange={(e) => setS({ ...s, workOffset: e.target.value })}>
                {offsets.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
            {axes.map((ax) => (
              <label key={ax}>
                <span>{t('stock.shift', { axis: ax })}</span>
                <input
                  type="number"
                  step={0.1}
                  value={s.offset?.[ax] ?? 0}
                  onChange={(e) => setS({ ...s, offset: { ...s.offset, [ax]: Number(e.target.value) || 0 } })}
                />
              </label>
            ))}
          </div>

          <h3>{t('stock.color')}</h3>
          <div className="swatches">
            {MATERIALS.map((m) => (
              <button
                key={m.id}
                className={`swatch ${(s.color ?? STOCK_COLOR).toLowerCase() === m.color ? 'on' : ''}`}
                style={{ background: m.color }}
                title={t(`material.${m.id}`)}
                aria-label={t(`material.${m.id}`)}
                onClick={() => setS({ ...s, color: m.color })}
              />
            ))}
            <label className="custom-color" title={t('stock.customColor')}>
              <input type="color" value={s.color ?? STOCK_COLOR} onChange={(e) => setS({ ...s, color: e.target.value })} />
              <span>{t('stock.customColor')}</span>
            </label>
          </div>
        </div>
        <footer>
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" disabled={!valid} onClick={() => onApply(s)}>{t('stock.apply')}</button>
        </footer>
      </div>
    </div>
  )
}
