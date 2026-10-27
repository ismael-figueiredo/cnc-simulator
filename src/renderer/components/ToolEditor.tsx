import { useId, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { insertOutline, isTurningTool, loadToolLibrary, ToolSchema, type Tool, type ToolLibrary } from '@core/index'
import { Dialog } from './Dialog'
import { optionalNumber } from '../forms'
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
const INSERTS = ToolSchema.shape.insert.unwrap().options
type ToolType = (typeof TYPES)[number]

const EMPTY: ToolLibrary = { id: 'project-tools', name: 'Project tools', units: 'mm', holders: [], tools: [] }

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'tools'

/** Side view of a rotating tool, scaled to fit, with its flutes drawn as a helix (only here, not in 3D). */
function RotaryPreview({ tool }: { tool: Tool }) {
  const clip = useId()
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
  const shankR = Math.max(r * 0.92, 3)

  let cutter = `M${cx - r} ${fluteTop}H${cx + r}V${tip}H${cx - r}Z`
  if (tool.type === 'ball-endmill') cutter = `M${cx - r} ${fluteTop}H${cx + r}V${tip - r}A${r} ${r} 0 0 1 ${cx - r} ${tip - r}Z`
  else if (tool.type === 'bull-endmill') {
    const cr = Math.min((tool.cornerRadius ?? d * 0.1) * k, r)
    cutter = `M${cx - r} ${fluteTop}H${cx + r}V${tip - cr}Q${cx + r} ${tip} ${cx + r - cr} ${tip}H${cx - r + cr}Q${cx - r} ${tip} ${cx - r} ${tip - cr}Z`
  } else if (tool.type === 'drill') cutter = `M${cx - r} ${fluteTop}H${cx + r}V${tip - r * 0.6}L${cx} ${tip}L${cx - r} ${tip - r * 0.6}Z`
  else if (tool.type === 'chamfer-mill') cutter = `M${cx - r} ${fluteTop}H${cx + r}V${tip - r}L${cx} ${tip}L${cx - r} ${tip - r}Z`
  else if (tool.type === 'tap') cutter = `M${cx - r} ${fluteTop}H${cx + r}V${tip - r * 0.6}L${cx + r * 0.7} ${tip}H${cx - r * 0.7}L${cx - r} ${tip - r * 0.6}Z`

  // Helix: flutes at 30° (drills, endmills) seen from the side; taps show the thread instead
  const pitch = Math.max(2 * r * Math.tan(Math.PI / 6) * 2, 4)
  const helix = tool.type === 'tap' ? [] : Array.from({ length: Math.ceil((tip - fluteTop) / pitch) + 2 }, (_, i) => fluteTop - pitch + i * pitch)
  const threads = tool.type === 'tap' ? Array.from({ length: Math.floor((tip - fluteTop) / 5) }, (_, i) => fluteTop + 3 + i * 5) : []

  return (
    <svg className="tool-preview" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden>
      <defs>
        <clipPath id={clip}>
          <path d={cutter} />
        </clipPath>
      </defs>
      <rect x={cx - shankR} y={top} width={shankR * 2} height={Math.max(fluteTop - top, 0)} className="shank" />
      <path d={cutter} className="cutter" />
      <g clipPath={`url(#${clip})`}>
        {helix.map((y) => (
          <path key={y} d={`M${cx - r} ${y + pitch * 0.55}C${cx - r * 0.3} ${y + pitch * 0.45} ${cx + r * 0.3} ${y + pitch * 0.1} ${cx + r} ${y}`} className="flute" />
        ))}
        {threads.map((y) => (
          <line key={y} x1={cx - r} x2={cx + r} y1={y + 2} y2={y} className="flute" />
        ))}
      </g>
      <line x1={cx - r} x2={cx + r} y1={tip + 6} y2={tip + 6} className="dim" />
      <text x={cx} y={tip + 18} textAnchor="middle" className="dim-text">
        Ø{tool.diameter}
      </text>
    </svg>
  )
}

/** Top view of a turning tool: the ISO insert at the corner and the shank (external) or bar (internal). */
function TurningPreview({ tool }: { tool: Tool }) {
  const W = 150
  const H = 230
  const pts = insertOutline(tool)
  const internal = tool.side === 'internal'
  const sy = tool.hand === 'left' ? -1 : 1
  // Shank (external, along +X) or boring bar (internal, along +Z), in insert mm
  const body: [number, number][] = internal
    ? [[-15, 4 * sy], [-1, 4 * sy], [-1, 60 * sy], [-15, 60 * sy]]
    : [[6, 0], [60, 0], [60, 20 * sy], [6, 20 * sy]]
  const all = [...pts, ...body]
  const xs = all.map(([x]) => x)
  const ys = all.map(([, y]) => y)
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const k = Math.min((W - 20) / (maxX - minX), (H - 40) / (maxY - minY))
  // Screen: X to the right, Z down (the chuck is above for a right-hand tool)
  const P = ([x, y]: [number, number]) => `${10 + (x - minX) * k},${20 + (maxY - y) * k}`
  return (
    <svg className="tool-preview" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden>
      <polygon points={body.map(P).join(' ')} className="shank" />
      <polygon points={pts.map(P).join(' ')} className="insert" />
      <circle cx={10 + (0 - minX) * k} cy={20 + (maxY - 0) * k} r={3} className="tip" />
      <text x={W / 2} y={H - 6} textAnchor="middle" className="dim-text">
        {tool.type === 'grooving' ? `L ${tool.diameter}` : (tool.insert ?? '')} {tool.side === 'internal' ? 'INT' : 'EXT'} {tool.hand === 'left' ? 'L' : 'R'}
      </text>
    </svg>
  )
}

const ToolPreview = ({ tool }: { tool: Tool }) => (isTurningTool(tool) ? <TurningPreview tool={tool} /> : <RotaryPreview tool={tool} />)

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
  const num = (e: ChangeEvent<HTMLInputElement>, key: keyof Tool) => setOptional(key, optionalNumber(e.target.value))
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
    <Dialog
      title={t('tools.editorTitle')}
      className="tool-editor"
      header={
        <>
          <span className="muted">{l(lib.name)}</span>
          <span className="spacer" />
          <button className="btn" onClick={() => void saveAsLibrary()}>{t('tools.saveLibrary')}</button>
          <button className="btn" onClick={() => importInput.current?.click()}>{t('tools.import')}</button>
          <button className="btn" onClick={exportJson}>{t('tools.export')}</button>
          <input ref={importInput} type="file" accept=".json,application/json" hidden onChange={importJson} />
        </>
      }
      footer={
        <>
          <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn primary" disabled={!allValid} onClick={() => onApply(lib)}>{t('tools.apply')}</button>
        </>
      }
      onClose={onClose}
    >

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
              {isTurningTool(tool) ? (
                <>
                  {field(
                    'side',
                    t('tools.side'),
                    <select value={tool.side ?? 'external'} onChange={(e) => setOptional('side', e.target.value)}>
                      <option value="external">{t('tools.external')}</option>
                      <option value="internal">{t('tools.internal')}</option>
                    </select>
                  )}
                  {field(
                    'hand',
                    t('tools.hand'),
                    <select value={tool.hand ?? 'right'} onChange={(e) => setOptional('hand', e.target.value)}>
                      <option value="right">{t('tools.right')}</option>
                      <option value="left">{t('tools.left')}</option>
                    </select>
                  )}
                  {tool.type !== 'grooving' &&
                    field(
                      'insert',
                      t('tools.insert'),
                      <select value={tool.insert ?? ''} onChange={(e) => setOptional('insert', e.target.value || undefined)}>
                        <option value="">{t('tools.insertDefault')}</option>
                        {INSERTS.map((s) => (
                          <option key={s} value={s}>{t(`insert.${s}`)}</option>
                        ))}
                      </select>
                    )}
                </>
              ) : (
                field(
                  'mount',
                  t('tools.mount'),
                  <select value={tool.mount ?? ''} onChange={(e) => setOptional('mount', e.target.value || undefined)}>
                    <option value="">{t('tools.mountHolder')}</option>
                    <option value="axial">{t('tools.axial')}</option>
                    <option value="radial">{t('tools.radial')}</option>
                  </select>
                )
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
    </Dialog>
  )
}
