// The setup as the SETTING, OFFSET and WORK pages show it: project, machine, control, stock, offsets, tools.
import { machineKind, type Control, type Machine, type Stock, type ToolLibrary, type ToolOffsets, type WorkOffsets } from '@core/index'
import { useI18n } from '../i18n'
import { STOCK_COLOR } from '../project'

type T = ReturnType<typeof useI18n>['t']

/** "Ø50 × 120 mm" or "100 × 80 × 30 mm", or that there is none. */
export const stockSummary = (t: T, stock: Stock | null) =>
  !stock
    ? t('stock.none')
    : stock.shape === 'cylinder'
      ? t('stock.summaryCylinder', { diameter: stock.diameter ?? 0, length: stock.length ?? 0 })
      : t('stock.summaryBlock', { x: stock.x ?? 0, y: stock.y ?? 0, z: stock.z ?? 0 })

/** File name of a project path (desktop path, browser download name or "example:…"). */
const baseName = (path: string) => path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'), path.indexOf(':')) + 1)

function Heading({ title, onEdit }: { title: string; onEdit?: () => void }) {
  const { t } = useI18n()
  return (
    <h2>
      {title}
      {onEdit && <button className="btn tiny head-action" onClick={onEdit}>{t('tools.edit')}</button>}
    </h2>
  )
}

export function ProjectBlock({ path, onSave }: { path: string | null; onSave: () => void }) {
  const { t } = useI18n()
  return (
    <div className="block">
      <h2>{t('project.title')}</h2>
      <p className="muted">{path ? baseName(path) : t('project.none')}</p>
      <button className="btn" title={t('project.explain')} onClick={onSave}>{t(path ? 'project.save' : 'project.create')}</button>
      <p className="muted small">{t('project.explain')}</p>
    </div>
  )
}

export function MachineBlock({ machine }: { machine: Machine }) {
  const { t, l } = useI18n()
  return (
    <div className="block">
      <h2>{t('machine.title')}</h2>
      <p className="muted">
        {machine.manufacturer ? `${machine.manufacturer} · ` : ''}
        {t(`machineType.${machine.type}`)} · {machine.kinematics}
      </p>
      <table className="table">
        <thead>
          <tr><th>{t('machine.axis')}</th><th>{t('machine.travel')}</th><th>{t('machine.rapid')}</th></tr>
        </thead>
        <tbody>
          {machine.axes.map((a) => (
            <tr key={a.name}>
              <td>{a.name}{a.diameter ? ' (Ø)' : ''}</td>
              <td>{a.type === 'rotary' ? t('machine.continuous') : `${a.min} … ${a.max}`}</td>
              <td>{a.rapid}{a.type === 'rotary' ? ' °/min' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        {t('machine.spindles')}: {machine.spindles.map((s) => `${l(s.name)} ${s.maxRpm} rpm`).join(' · ')}
      </p>
      {machine.notes && <p className="note">{l(machine.notes)}</p>}
    </div>
  )
}

/** The control's dialect, and a warning when it is for another kind of machine. */
export function ControlBlock({ control, machine }: { control: Control; machine: Machine | undefined }) {
  const { t } = useI18n()
  return (
    <div className="block">
      <h2>{t('control.title')}</h2>
      <p className="muted">
        {t('control.summary', {
          family: control.family,
          system: control.dialect.gCodeSystem,
          macro: control.dialect.macro,
          g: Object.keys(control.gCodes).length,
          m: Object.keys(control.mCodes).length
        })}
      </p>
      {machine && machineKind(machine) !== control.machineType && (
        <p className="warning">
          {t('control.mismatch', {
            controlType: t(`machineType.${control.machineType}`),
            machineType: t(`machineType.${machine.type}`)
          })}
        </p>
      )}
    </div>
  )
}

export function StockBlock({ stock, onEdit }: { stock: Stock | null; onEdit: () => void }) {
  const { t } = useI18n()
  return (
    <div className="block">
      <Heading title={t('stock.title')} onEdit={onEdit} />
      {stock ? (
        <p className="stock-summary">
          <i style={{ background: stock.color ?? STOCK_COLOR }} />
          {stockSummary(t, stock)}
          <span className="muted"> · {stock.workOffset ?? 'G54'}</span>
        </p>
      ) : (
        <p className="muted">{t('stock.none')}</p>
      )}
    </div>
  )
}

export function WorkOffsetsBlock({ offsets, onEdit }: { offsets: WorkOffsets; onEdit: () => void }) {
  const { t } = useI18n()
  return (
    <div className="block">
      <Heading title={t('offsets.title')} onEdit={onEdit} />
      {Object.keys(offsets).length ? (
        <ul className="list mono">
          {Object.entries(offsets).map(([name, o]) => (
            <li key={name}>
              <b>{name}</b>{' '}
              {Object.entries(o)
                .map(([ax, v]) => `${ax}${v}`)
                .join(' ')}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">{t('offsets.none')}</p>
      )}
    </div>
  )
}

/** Sign and value of a wear entry, or nothing when it is zero. */
const wear = (v: number | undefined) => (v ? `${v > 0 ? '+' : ''}${v}` : '')

/** The first offsets: geometry and wear on lathes, H (length) and D (radius) on machining centers. */
export function ToolOffsetsBlock({ offsets, lathe, onEdit }: { offsets: ToolOffsets; lathe: boolean; onEdit: () => void }) {
  const { t } = useI18n()
  return (
    <div className="block">
      <Heading title={t('toolOffsets.title')} onEdit={onEdit} />
      <ul className="list mono">
        {Object.entries(offsets)
          .sort(([a], [b]) => Number(a) - Number(b))
          .slice(0, 8)
          .map(([n, o]) => (
            <li key={n}>
              <b>{n.padStart(2, '0')}</b>{' '}
              {lathe
                ? `X${o.x ?? 0} Z${o.z ?? 0}${o.nose !== undefined ? ` R${o.nose}` : ''}${o.xWear || o.zWear ? ` · Δ X${o.xWear ?? 0} Z${o.zWear ?? 0}` : ''}`
                : `H${o.length ?? '—'}${wear(o.lengthWear)} D${o.radius ?? '—'}${wear(o.radiusWear)}`}
            </li>
          ))}
      </ul>
      {!Object.keys(offsets).length && <p className="muted">{t('toolOffsets.none')}</p>}
    </div>
  )
}

export function ToolsBlock({ tools, onEdit }: { tools: ToolLibrary | null; onEdit: () => void }) {
  const { t, l } = useI18n()
  return (
    <div className="block">
      <Heading title={t('tools.title')} onEdit={onEdit} />
      {!tools?.tools.length && <p className="muted">{t('tools.none')}</p>}
      <ul className="list">
        {tools?.tools.map((tool) => (
          <li key={tool.number}>
            <b>T{String(tool.number).padStart(2, '0')}</b> {l(tool.name)}
            <span className="muted"> · {t('tools.radius', { radius: tool.diameter / 2 })} · {tool.holder ?? t('tools.noHolder')}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
