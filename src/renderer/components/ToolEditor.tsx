import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { loadToolLibrary, ToolSchema, type Tool, type ToolLibrary } from '@core/index'
import { useI18n } from '../i18n'

interface Props {
  /** The project's tools (a copy is edited; nothing changes until Apply). */
  tools: ToolLibrary | null
  bundled: ToolLibrary[]
  user: ToolLibrary[]
  onSaveLibrary: (lib: ToolLibrary) => Promise<void>
  onDeleteLibrary: (id: string) => Promise<void>
  onApply: (lib: ToolLibrary) => void
  onClose: () => void
}

const TYPES = ToolSchema.shape.type.options
type ToolType = (typeof TYPES)[number]
const LATHE_TYPES: ToolType[] = ['turning-insert', 'grooving', 'threading', 'boring-bar']

const EMPTY: ToolLibrary = { id: 'project-tools', name: 'Project tools', units: 'mm', holders: [], tools: [] }

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'tools'

/** Side view of the tool, scaled to fit: enough to check diameter, lengths and the tip shape. */
function ToolPreview({ tool }: { tool: Tool }) {
  const W = 150
  const H = 230
  const d = Math.max(tool.diameter, 0.5)
  const len = Math.max(tool.length, 1)
  const flute = Math.min(tool.fluteLength ?? len * 0.4, len)
  // Room below the tip for the diameter mark
  const k = Math.min((W - 30) / Math.max(d, 8), (H - 40) / len)
  const cx = W / 2
  const r = (d * k) / 2
  const top = 10
  const tip = top + len * k
  const fluteTop = tip - flute * k
  const lathe = LATHE_TYPES.includes(tool.type)
  const shankR = lathe ? Math.max(r, 10) : Math.max(r * 0.9, 3)

  let cutter = `M${cx - r} ${fluteTop}H${cx + r}V${tip}H${cx - r}Z`
  if (tool.type === 'ball-endmill') cutter = `M${cx - r} ${fluteTop}H${cx + r}V${tip - r}A${r} ${r} 0 0 1 ${cx - r} ${tip - r}Z`
  else if (tool.type === 'bull-endmill') {
    const cr = Math.min((tool.cornerRadius ?? d * 0.1) * k, r)
    cutter = `M${cx - r} ${fluteTop}H${cx + r}V${tip - cr}Q${cx + r} ${tip} ${cx + r - cr} ${tip}H${cx - r + cr}Q${cx - r} ${tip} ${cx - r} ${tip - cr}Z`
  } else if (tool.type === 'drill') cutter = `M${cx - r} ${fluteTop}H${cx + r}V${tip - r * 0.6}L${cx} ${tip}L${cx - r} ${tip - r * 0.6}Z`
  else if (tool.type === 'chamfer-mill') cutter = `M${cx - r} ${fluteTop}H${cx + r}V${tip - r}L${cx} ${tip}L${cx - r} ${tip - r}Z`
  else if (tool.type === 'turning-insert') cutter = `M${cx - shankR} ${fluteTop}H${cx + shankR}V${tip - 14}L${cx} ${tip}L${cx - shankR} ${tip - 6}Z`
  else if (tool.type === 'threading') cutter = `M${cx - shankR} ${fluteTop}H${cx + shankR}V${tip - 12}L${cx} ${tip}L${cx - shankR} ${tip - 12}Z`
  else if (tool.type === 'grooving') {
    const g = Math.max(r, 2)
    cutter = `M${cx - shankR} ${fluteTop}H${cx + shankR}V${tip - 18}H${cx + g}V${tip}H${cx - g}V${tip - 18}H${cx - shankR}Z`
  } else if (tool.type === 'boring-bar') cutter = `M${cx - shankR * 0.6} ${fluteTop}H${cx + shankR * 0.6}V${tip - 8}L${cx + shankR * 0.6 + 8} ${tip}H${cx - shankR * 0.6}Z`

  return (
    <svg className="tool-preview" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden>
      <rect x={cx - shankR} y={top} width={shankR * 2} height={Math.max(fluteTop - top, 0)} className="shank" />
      <path d={cutter} className="cutter" />
      {tool.type === 'tap' &&
        Array.from({ length: Math.floor((tip - fluteTop) / 6) }, (_, i) => (
          <line key={i} x1={cx - r} x2={cx + r} y1={fluteTop + 4 + i * 6} y2={fluteTop + 1 + i * 6} className="flute" />
        ))}
      <line x1={cx - r} x2={cx + r} y1={tip + 6} y2={tip + 6} className="dim" />
      <text x={cx} y={tip + 18} textAnchor="middle" className="dim-text">
        Ø{tool.diameter}
      </text>
    </svg>
  )
}

export function ToolEditor({ tools, bundled, user, onSaveLibrary, onDeleteLibrary, onApply, onClose }: Props) {
  const { t, l, lang } = useI18n()
  const [lib, setLib] = useState<ToolLibrary>(() => structuredClone(tools ?? EMPTY))
  const [selected, setSelected] = useState(0)
  const [changed, setChanged] = useState(false)
  const importInput = useRef<HTMLInputElement>(null)

  const tool = lib.tools[selected]
  const issues = useMemo(() => {
    if (!tool) return new Map<string, string>()
    const r = ToolSchema.safeParse(tool)
    return new Map(r.success ? [] : r.error.issues.map((i) => [String(i.path[0]), i.message]))
  }, [tool])
  const numbers = lib.tools.map((x) => x.number)
  const duplicate = tool && numbers.filter((n) => n === tool.number).length > 1
  const allValid = lib.tools.every((x) => ToolSchema.safeParse(x).success)

  function update(tools: Tool[], select = selected) {
    setLib({ ...lib, tools })
    setSelected(Math.max(0, Math.min(select, tools.length - 1)))
    setChanged(true)
  }
  function patch(p: Partial<Tool>) {
    if (!tool) return
    update(lib.tools.map((x, i) => (i === selected ? { ...x, ...p } : x)))
  }
  /** Optional field: undefined removes it from the tool. */
  function setOptional(key: keyof Tool, v: number | string | undefined) {
    if (!tool) return
    const { [key]: _old, ...rest } = tool
    const next = (v === undefined ? rest : { ...rest, [key]: v }) as Tool
    update(lib.tools.map((x, i) => (i === selected ? next : x)))
  }
  const num = (e: ChangeEvent<HTMLInputElement>, key: keyof Tool) => setOptional(key, e.target.value === '' ? undefined : Number(e.target.value))
  function setName(v: string) {
    if (!tool) return
    patch({ name: typeof tool.name === 'string' ? v : { ...tool.name, [lang]: v } })
  }
  function add(base?: Tool) {
    const next = Math.max(0, ...numbers) + 1
    const fresh: Tool = base
      ? { ...structuredClone(base), number: next, offset: next }
      : { number: next, offset: next, name: t('tools.newName'), type: 'flat-endmill', diameter: 10, length: 50, fluteLength: 22, flutes: 4 }
    update([...lib.tools, fresh], lib.tools.length)
  }
  function load(source: ToolLibrary) {
    if (changed && !window.confirm(t('tools.replaceConfirm', { name: l(source.name) }))) return
    setLib(structuredClone(source))
    setSelected(0)
    setChanged(true)
  }
  async function saveAsLibrary() {
    const name = window.prompt(t('tools.libraryName'), l(lib.name))?.trim()
    if (!name) return
    const saved = { ...lib, id: `${slug(name)}-${Date.now().toString(36)}`, name }
    await onSaveLibrary(saved)
    setLib(saved)
  }
  function exportJson() {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([`${JSON.stringify(lib, null, 2)}\n`], { type: 'application/json' }))
    a.download = `${slug(l(lib.name))}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  function importJson(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    void f.text().then((text) => {
      const r = loadToolLibrary(text, f.name)
      if (r.ok) load(r.value)
      else window.alert(`${t('tools.importInvalid')}\n\n${r.issues.map((i) => `${i.path || '/'}: ${i.message}`).join('\n')}`)
    })
  }

  const field = (key: string, label: string, input: ReactNode) => (
    <label className={issues.has(key) ? 'invalid' : ''}>
      <span>{label}</span>
      {input}
      {issues.has(key) && <small>{issues.get(key)}</small>}
    </label>
  )

  return (
    <div className="modal-backdrop" role="dialog" aria-modal aria-label={t('tools.editorTitle')}>
      <div className="modal tool-editor">
        <header>
          <h2>{t('tools.editorTitle')}</h2>
          <span className="muted">{l(lib.name)}</span>
          <span className="spacer" />
          <button className="btn" onClick={() => void saveAsLibrary()}>{t('tools.saveLibrary')}</button>
          <button className="btn" onClick={() => importInput.current?.click()}>{t('tools.import')}</button>
          <button className="btn" onClick={exportJson}>{t('tools.export')}</button>
          <input ref={importInput} type="file" accept=".json,application/json" hidden onChange={importJson} />
        </header>

        <div className="tool-body">
          <section className="tool-libraries">
            <h3>{t('tools.myLibraries')}</h3>
            {!user.length && <p className="muted">{t('tools.noLibraries')}</p>}
            {user.map((u) => (
              <div key={u.id} className="lib-row">
                <button className="link" onClick={() => load(u)} title={t('tools.load')}>
                  {l(u.name)} <span className="muted">· {u.tools.length}</span>
                </button>
                <button className="btn tiny" title={t('tools.deleteLibrary')} aria-label={t('tools.deleteLibrary')} onClick={() => window.confirm(t('tools.deleteConfirm', { name: l(u.name) })) && void onDeleteLibrary(u.id)}>
                  ×
                </button>
              </div>
            ))}
            <h3>{t('tools.bundled')}</h3>
            {bundled.map((b) => (
              <div key={b.id} className="lib-row">
                <button className="link" onClick={() => load(b)} title={t('tools.load')}>
                  {l(b.name)} <span className="muted">· {b.tools.length}</span>
                </button>
              </div>
            ))}
          </section>

          <section className="tool-list">
            <ul>
              {lib.tools.map((x, i) => (
                <li key={i}>
                  <button className={i === selected ? 'on' : ''} onClick={() => setSelected(i)}>
                    <b>T{String(x.number).padStart(2, '0')}</b> {l(x.name)}
                    <span className="muted">{t(`toolType.${x.type}`)} · Ø{x.diameter}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="row">
              <button className="btn" onClick={() => add()}>{t('tools.add')}</button>
              <button className="btn" disabled={!tool} onClick={() => tool && add(tool)}>{t('tools.duplicate')}</button>
              <button className="btn" disabled={!tool} onClick={() => update(lib.tools.filter((_, i) => i !== selected))}>{t('tools.delete')}</button>
            </div>
          </section>

          {tool ? (
            <section className="tool-form">
              <div className="fields">
                {field('number', t('tools.number'), <input type="number" min={0} step={1} value={tool.number} onChange={(e) => patch({ number: Number(e.target.value) })} />)}
                {field('offset', t('tools.offset'), <input type="number" min={0} step={1} value={tool.offset ?? ''} onChange={(e) => num(e, 'offset')} />)}
                {field('name', t('tools.name'), <input value={l(tool.name)} onChange={(e) => setName(e.target.value)} />)}
                {field(
                  'type',
                  t('tools.type'),
                  <select value={tool.type} onChange={(e) => patch({ type: e.target.value as ToolType })}>
                    {TYPES.map((ty) => (
                      <option key={ty} value={ty}>{t(`toolType.${ty}`)}</option>
                    ))}
                  </select>
                )}
                {field('diameter', t('tools.diameter'), <input type="number" min={0} step={0.01} value={tool.diameter} onChange={(e) => patch({ diameter: Number(e.target.value) })} />)}
                {field('length', t('tools.length'), <input type="number" min={0} step={0.1} value={tool.length} onChange={(e) => patch({ length: Number(e.target.value) })} />)}
                {field('fluteLength', t('tools.fluteLength'), <input type="number" min={0} step={0.1} value={tool.fluteLength ?? ''} onChange={(e) => num(e, 'fluteLength')} />)}
                {field('cornerRadius', t('tools.cornerRadius'), <input type="number" min={0} step={0.01} value={tool.cornerRadius ?? ''} onChange={(e) => num(e, 'cornerRadius')} />)}
                {field('flutes', t('tools.flutes'), <input type="number" min={1} step={1} value={tool.flutes ?? ''} onChange={(e) => num(e, 'flutes')} />)}
                {field('tipDirection', t('tools.tipDirection'), <input type="number" min={0} max={9} step={1} value={tool.tipDirection ?? ''} onChange={(e) => num(e, 'tipDirection')} />)}
                {field(
                  'holder',
                  t('tools.holder'),
                  <select value={tool.holder ?? ''} onChange={(e) => setOptional('holder', e.target.value || undefined)}>
                    <option value="">{t('tools.noHolder')}</option>
                    {lib.holders.map((h) => (
                      <option key={h.id} value={h.id}>{l(h.name)}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="preview">
                <ToolPreview tool={tool} />
                {duplicate && <p className="warning">{t('tools.duplicateNumber', { number: tool.number })}</p>}
              </div>
            </section>
          ) : (
            <section className="tool-form">
              <p className="muted">{t('tools.empty')}</p>
            </section>
          )}
        </div>

        <footer>
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" disabled={!allValid} onClick={() => onApply(lib)}>{t('tools.apply')}</button>
        </footer>
      </div>
    </div>
  )
}
