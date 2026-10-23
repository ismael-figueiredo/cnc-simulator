import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from 'react'
import {
  loadAlarmCatalog,
  loadControl,
  loadMachine,
  loadProject,
  loadToolLibrary,
  simulate,
  type AlarmCatalog,
  type ConfigIssue,
  type Control,
  type Diagnostic,
  type Machine,
  type Severity,
  type Stock,
  type ToolLibrary,
  type WorkOffsets
} from '@core/index'
import { LANGUAGES, isLanguage } from '@i18n/index'
import type { MenuCommand, OpenedFile } from '../preload/api'
import { CodeView } from './components/CodeView'
import { ProgramEditor, type EditorHandle } from './components/ProgramEditor'
import { Player } from './components/Player'
import { PositionPanel } from './components/PositionPanel'
import { StartScreen } from './components/StartScreen'
import { StockEditor } from './components/StockEditor'
import { ToolEditor } from './components/ToolEditor'
import { WorkOffsetsEditor } from './components/WorkOffsetsEditor'
import { PATH_COLORS, Viewport3D } from './components/Viewport3D'
import { useI18n } from './i18n'
import { useLibraries } from './libraries'
import { defaultSetup, projectData, setupFromProject, STOCK_COLOR, type Setup } from './project'
import { useRecent } from './recent'
import { buildTimeline, formatTime, fractionOf, moveAt, pointAlong, positionAlong, type Timeline } from './playback'

import sampleO1500 from '../../examples/O1500_COROA_ANSI40.nc?raw'

// Every JSON in configs/ ships with the app: dropping a file in the folder adds it.
const machineFiles = import.meta.glob<unknown>('../../configs/machines/*.json', { eager: true, import: 'default' })
const controlFiles = import.meta.glob<unknown>('../../configs/controls/*.json', { eager: true, import: 'default' })
const toolFiles = import.meta.glob<unknown>('../../configs/tools/*.json', { eager: true, import: 'default' })
const alarmFiles = import.meta.glob<unknown>('../../configs/alarms/*.json', { eager: true, import: 'default' })
const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1)
/** The Romi GL 250 M opens first: it is the machine of the bundled O1500 example. */
const FIRST_MACHINE = 'romi-gl250-m'
const EXAMPLE = { name: 'O1500_COROA_ANSI40.nc', path: 'example:O1500', text: sampleO1500 }

const VERSION = __APP_VERSION__

interface Program {
  name: string
  /** File path on the desktop; the file name (or "example:…") in the browser. */
  path: string
  text: string
}

interface BundledConfigs {
  machines: Machine[]
  controls: Control[]
  library: ToolLibrary | null
  libraries: ToolLibrary[]
  alarmCatalogs: AlarmCatalog[]
  issues: ConfigIssue[]
}

// Configs shipped with the app. Phase 3 adds loading the user's own JSON files.
// Takes the language only so callers re-run it when validation messages must be translated again.
function loadBundled(_lang: string): BundledConfigs {
  const issues: ConfigIssue[] = []
  function loadAll<T>(files: Record<string, unknown>, load: (data: unknown, source: string) => { ok: true; value: T } | { ok: false; issues: ConfigIssue[] }): T[] {
    const out: T[] = []
    for (const [path, data] of Object.entries(files)) {
      const r = load(data, fileName(path))
      if (r.ok) out.push(r.value)
      else issues.push(...r.issues)
    }
    return out
  }
  const machines = loadAll(machineFiles, loadMachine).sort(
    (a, b) => Number(b.id === FIRST_MACHINE) - Number(a.id === FIRST_MACHINE) || a.name.localeCompare(b.name)
  )
  const controls = loadAll(controlFiles, loadControl).sort((a, b) => a.name.localeCompare(b.name))
  const libraries = loadAll(toolFiles, loadToolLibrary)
  const alarmCatalogs = loadAll(alarmFiles, loadAlarmCatalog)
  return { machines, controls, library: libraries[0] ?? null, libraries, alarmCatalogs, issues }
}

interface Simulation {
  timeline: Timeline | null
  time: number
  playing: boolean
}

function run(program: Program | null, machine: Machine | undefined, control: Control | undefined, cfg: BundledConfigs, setup: Setup): Simulation {
  if (!program || !machine || !control) return { timeline: null, time: 0, playing: false }
  const alarms = cfg.alarmCatalogs.find((a) => a.id === control.alarms) ?? null
  const timeline = buildTimeline(simulate({ text: program.text, machine, control, tools: setup.tools, alarms, workOffsets: setup.workOffsets }))
  return { timeline, time: timeline.total, playing: false }
}

const FONT_KEY = 'cncsim.codeFontSize'
const WIDTH_KEY = 'cncsim.codeWidth'
const readNumber = (key: string, fallback: number) => {
  try {
    const v = Number(localStorage.getItem(key))
    return Number.isFinite(v) && v > 0 ? v : fallback
  } catch {
    return fallback
  }
}
const writeNumber = (key: string, v: number) => {
  try {
    localStorage.setItem(key, String(v))
  } catch {
    // not persisted
  }
}

/** Browser mode: hands a file to the downloads folder. */
function download(name: string, text: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

const SEVERITY_ORDER: Record<Severity, number> = { alarm: 0, warning: 1, info: 2 }

export function App() {
  const { lang, setLang, t, l } = useI18n()
  // Re-validate on language change so schema messages come out in the new language.
  const cfg = useMemo(() => loadBundled(lang), [lang])
  const [machineId, setMachineId] = useState(cfg.machines[0]?.id ?? '')
  const machine = cfg.machines.find((m) => m.id === machineId) ?? cfg.machines[0]
  const [controlId, setControlId] = useState(machine?.defaultControl ?? cfg.controls[0]?.id ?? '')
  const control = cfg.controls.find((c) => c.id === controlId)
  // No program on start: the start screen lists the recent files and the example
  const [program, setProgram] = useState<Program | null>(null)
  const recent = useRecent()
  // EDIT: the text is in CodeMirror (read it with editor.current.getText()); MEM: read-only run screen
  const [mode, setMode] = useState<'mem' | 'edit'>('mem')
  const [dirty, setDirty] = useState(false)
  /** Bumped on every new or opened program, so the editor starts over with the new text. */
  const [programKey, setProgramKey] = useState(0)
  const editor = useRef<EditorHandle>(null)
  // Stock, tools and work offsets: from the open project, or the machine's defaults
  const [setup, setSetup] = useState<Setup>(() => defaultSetup(machine, cfg.library))
  /** The .cncsim file the setup came from, or null for a program opened alone. */
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [sim, setSim] = useState<Simulation>(() => run(program, machine, control, cfg, setup))
  const [fontSize, setFontSize] = useState(() => readNumber(FONT_KEY, 11.5))
  const [codeWidth, setCodeWidth] = useState(() => readNumber(WIDTH_KEY, 300))
  const [speed, setSpeed] = useState(20)
  const [showRapids, setShowRapids] = useState(true)
  const [showStock, setShowStock] = useState(true)
  const fileInput = useRef<HTMLInputElement>(null)
  const libraries = useLibraries()
  const [editingTools, setEditingTools] = useState(false)
  const [editingStock, setEditingStock] = useState(false)
  const [editingOffsets, setEditingOffsets] = useState(false)

  const lines = useMemo(() => (program?.text ?? '').replace(/\r/g, '').split('\n'), [program])
  const tl = sim.timeline
  const result = tl?.result ?? null
  const index = tl ? moveAt(tl, sim.time) : -1
  const fraction = tl && index >= 0 ? fractionOf(tl, index, sim.time) : 1
  const moves = result?.moves ?? []
  const move = moves[index]
  const position = move ? positionAlong(moves[index - 1], move, fraction) : undefined
  const machinePosition = move ? positionAlong(moves[index - 1], move, fraction, (m) => m.machinePosition) : undefined

  // ---- actions (simulation is recomputed in event handlers, not in effects) ----
  function simulateWith(p: Program | null, m: Machine | undefined, c: Control | undefined, s: Setup = setup) {
    setSim(run(p, m, c, cfg, s))
  }
  const changeFont = useCallback((delta: number) => {
    setFontSize((f) => {
      const next = Math.min(22, Math.max(8, Math.round((f + delta) * 2) / 2))
      writeNumber(FONT_KEY, next)
      return next
    })
  }, [])
  function startResize(e: ReactPointerEvent<HTMLDivElement>) {
    // Drag the divider to widen the program panel
    const startX = e.clientX
    const startW = codeWidth
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    let w = startW
    const move = (ev: PointerEvent) => {
      w = Math.min(window.innerWidth * 0.6, Math.max(200, startW + ev.clientX - startX))
      setCodeWidth(w)
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      writeNumber(WIDTH_KEY, Math.round(w))
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  }
  /** The program with the text being edited, if any. */
  function currentProgram(): Program | null {
    if (!program || mode !== 'edit' || !editor.current) return program
    return { ...program, text: editor.current.getText() }
  }
  /** Asks before throwing away unsaved edits. */
  function canDiscard(): boolean {
    return !dirty || !program || window.confirm(t('dialog.unsavedDiscard', { name: program.name }))
  }
  function load(p: Program | null, nextMode: 'mem' | 'edit' = 'mem') {
    setProgram(p)
    setMode(nextMode)
    setDirty(false)
    setProgramKey((k) => k + 1)
  }
  function openProgram(f: OpenedFile) {
    if (!canDiscard()) return
    if (f.project) {
      openProject(f, f.project)
      return
    }
    // A program opened alone takes the machine's own stock and no work offsets
    const p = { name: f.name, path: f.path, text: f.text }
    const s = defaultSetup(machine, cfg.library)
    load(p)
    setSetup(s)
    setProjectPath(null)
    recent.record(p)
    simulateWith(p, machine, control, s)
  }
  function openProject(f: OpenedFile, project: NonNullable<OpenedFile['project']>) {
    const r = loadProject(project.text, project.path)
    if (!r.ok) {
      window.alert(`${t('project.invalid')}\n\n${r.issues.map(issueText).join('\n')}`)
      return
    }
    const pr = r.value
    const m = cfg.machines.find((x) => x.id === pr.machine)
    const c = cfg.controls.find((x) => x.id === pr.control)
    if (!m || !c) window.alert(t('project.unknownConfig', { machine: pr.machine, control: pr.control }))
    const mm = m ?? machine
    const cc = c ?? control
    // Desktop: the program file next to the project; browser: the copy inside it
    const text = window.api ? f.text : (pr.programText ?? '')
    if (window.api && project.programMissing) window.alert(t('project.programMissing', { program: pr.program }))
    const p = { name: pr.program.slice(pr.program.lastIndexOf('/') + 1), path: f.path || pr.program, text }
    const s = setupFromProject(pr, mm, cfg.library)
    if (mm) setMachineId(mm.id)
    if (cc) setControlId(cc.id)
    load(p)
    setSetup(s)
    setProjectPath(project.path)
    simulateWith(p, mm, cc, s)
  }
  async function saveProject(saveAs: boolean) {
    let p = currentProgram()
    if (!p || !machine || !control) return
    const data = projectData(machine.id, control.id, setup)
    if (!window.api) {
      const name = projectPath ?? `${p.name.replace(/\.[^.]+$/, '')}.cncsim`
      download(name, JSON.stringify({ ...data, program: p.name, programText: p.text }, null, 2), 'application/json')
      setProjectPath(name)
      return
    }
    // The project points to the program file, so a new or edited program is saved first
    if (dirty || !p.path || p.path.startsWith('example:')) {
      p = await save(false)
      if (!p) return
    }
    const path = await window.api.saveProject({ project: data, projectPath: saveAs ? '' : (projectPath ?? ''), programPath: p.path }, saveAs)
    if (path) setProjectPath(path)
  }
  function newProgram() {
    if (!canDiscard()) return
    // Skeleton in the selected control's format: % leader, program number, M30
    const eob = control?.fileFormat?.eob === 'semicolon' ? ';' : ''
    const text = ['%', `O0001 (${t('program.newComment')})${eob}`, '', `M30${eob}`, '%', ''].join('\n')
    const p = { name: 'O0001.nc', path: '', text }
    load(p, 'edit')
    simulateWith(p, machine, control)
  }
  /** Saves the program; returns it with its new name and path, or null if cancelled. */
  async function save(saveAs: boolean): Promise<Program | null> {
    let p = currentProgram()
    if (!p) return null
    if (window.api) {
      // The example and new programs have no file yet: always ask where to save
      const r = await window.api.saveFile(p, saveAs || !p.path || p.path.startsWith('example:'))
      if (!r) return null
      p = { name: r.name, path: r.path, text: r.text }
    } else {
      // Browser: the file goes to the downloads folder
      download(p.name, p.text, 'text/plain')
      recent.record(p)
    }
    setProgram(p)
    setDirty(false)
    return p
  }
  /** MEM: take the edited text and run it, like switching the control from EDIT to MEM. */
  function runMem() {
    const p = currentProgram()
    if (p !== program) setProgram(p)
    setMode('mem')
    simulateWith(p, machine, control)
  }
  function openExample() {
    if (!canDiscard()) return
    setProjectPath(null)
    // The example is a Romi GL 250 M program: select that machine and its control with it
    const m = cfg.machines.find((x) => x.id === FIRST_MACHINE) ?? machine
    const c = cfg.controls.find((x) => x.id === m?.defaultControl) ?? control
    if (m) setMachineId(m.id)
    if (c) setControlId(c.id)
    const s = defaultSetup(m, cfg.library)
    load(EXAMPLE)
    setSetup(s)
    simulateWith(EXAMPLE, m, c, s)
  }
  function showStart() {
    if (!canDiscard()) return
    load(null)
    setProjectPath(null)
    setSim(run(null, machine, control, cfg, setup))
  }
  function changeMachine(id: string) {
    const m = cfg.machines.find((x) => x.id === id)
    const c = cfg.controls.find((x) => x.id === m?.defaultControl) ?? control
    setMachineId(id)
    if (c) setControlId(c.id)
    // Another machine brings its own stock; tools and work offsets stay
    const s = { ...setup, stock: defaultSetup(m, cfg.library).stock }
    setSetup(s)
    simulateWith(currentProgram(), m, c, s)
  }
  function changeControl(id: string) {
    setControlId(id)
    simulateWith(currentProgram(), machine, cfg.controls.find((x) => x.id === id))
  }
  function applyStock(stock: Stock) {
    // The stock is only drawn for now (no material removal), so the simulation stays as is
    setSetup({ ...setup, stock })
    setEditingStock(false)
  }
  function applyOffsets(workOffsets: WorkOffsets) {
    const s = { ...setup, workOffsets }
    setSetup(s)
    setEditingOffsets(false)
    simulateWith(currentProgram(), machine, control, s)
  }
  function applyTools(lib: ToolLibrary) {
    const s = { ...setup, tools: lib }
    setSetup(s)
    setEditingTools(false)
    simulateWith(currentProgram(), machine, control, s)
  }
  async function pickProgram() {
    // Electron uses the native dialog; the browser (server mode) falls back to <input type=file>.
    if (window.api) {
      const r = await window.api.openFile()
      if (r) openProgram(r)
    } else fileInput.current?.click()
  }
  function readInput(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    void f.text().then((text) =>
      openProgram(f.name.toLowerCase().endsWith('.cncsim') ? { name: f.name, path: '', text: '', project: { path: f.name, text, programMissing: false } } : { name: f.name, path: f.name, text })
    )
    e.target.value = ''
  }

  const seek = useCallback((time: number) => {
    setSim((s) => ({ ...s, playing: false, time: Math.max(0, Math.min(s.timeline?.total ?? 0, time)) }))
  }, [])
  const seekMove = useCallback((k: number) => {
    setSim((s) => ({ ...s, playing: false, time: s.timeline?.cumulative[k + 1] ?? 0 }))
  }, [])
  function step(dir: -1 | 1) {
    if (!tl?.result.moves.length) return
    const atEnd = fraction >= 1
    let k = dir > 0 ? (atEnd ? index + 1 : index) : atEnd ? index - 1 : index - 1
    k = Math.max(-1, Math.min(tl.result.moves.length - 1, k))
    if (k < 0) seek(0)
    else seekMove(k)
  }
  function togglePlay() {
    // Playing from the end starts over
    setSim((s) => (s.playing ? { ...s, playing: false } : { ...s, playing: true, time: s.time >= (s.timeline?.total ?? 0) ? 0 : s.time }))
  }

  // Clicking a line jumps to its next execution (loops run the same line many times).
  const jumpToLine = useCallback(
    (line: number) => {
      const hits = tl?.movesByLine.get(line)
      if (!hits?.length) return
      const next = hits.find((h) => h > index) ?? hits[0] ?? 0
      seekMove(next)
    },
    [tl, index, seekMove]
  )

  // ---- playback loop ----
  const playing = sim.playing
  useEffect(() => {
    if (!playing) return
    let last = 0
    let frame = requestAnimationFrame(function tick(ts) {
      const dt = last ? (ts - last) / 1000 : 0
      last = ts
      setSim((s) => {
        if (!s.playing) return s
        const total = s.timeline?.total ?? 0
        const time = Math.min(total, s.time + dt * speed)
        return { ...s, time, playing: time < total }
      })
      frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing, speed])

  // Desktop: File > Open program… in the native menu.
  const onMenuOpen = useEffectEvent((f: Program) => openProgram(f))
  useEffect(() => window.api?.onFileOpened(onMenuOpen), [])
  const onMenuHome = useEffectEvent(showStart)
  useEffect(() => window.api?.onShowStart(onMenuHome), [])
  const onMenuCommand = useEffectEvent((command: MenuCommand) => {
    if (command === 'new') newProgram()
    else if (command === 'saveProject') void saveProject(false)
    else if (program) void save(command === 'saveAs')
  })
  useEffect(() => window.api?.onMenuCommand(onMenuCommand), [])
  // Browser mode has no native menu: the same shortcuts from the keyboard
  useEffect(() => {
    if (window.api) return
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 's') onMenuCommand(e.altKey ? 'saveProject' : e.shiftKey ? 'saveAs' : 'save')
      else if (k === 'n' && e.altKey) onMenuCommand('new') // Ctrl+N opens a browser window
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  // The main process asks before closing the window with unsaved edits
  useEffect(() => {
    void window.api?.setDirty(dirty)
  }, [dirty])

  // ---- derived lists ----
  const diagnostics = useMemo(
    () => (result?.diagnostics ?? []).slice().sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.line - b.line),
    [result]
  )
  const marks = useMemo(() => {
    const m = new Map<number, Severity>()
    for (const d of diagnostics) {
      const prev = m.get(d.line)
      if (!prev || SEVERITY_ORDER[d.severity] < SEVERITY_ORDER[prev]) m.set(d.line, d.severity)
    }
    return m
  }, [diagnostics])
  const hits = useMemo(() => new Set(tl?.movesByLine.keys() ?? []), [tl])

  const diagText = (d: Diagnostic) => t(`diag.${d.code}`, d.params)
  /** A diagnostic on a line without moves (e.g. the alarm block) goes to where the machine stopped. */
  function jumpToDiagnostic(d: Diagnostic) {
    if (tl?.movesByLine.has(d.line)) jumpToLine(d.line)
    else if (d.moveIndex !== undefined) {
      if (d.moveIndex > 0) seekMove(d.moveIndex - 1)
      else seek(0)
    }
  }
  const stoppedBy = result?.stoppedBy
  const issueText = (i: ConfigIssue) =>
    i.kind === 'invalid-json'
      ? t('config.invalidJson', { source: i.source, message: i.message })
      : t('config.issue', { source: i.source, path: i.path || t('config.root'), message: i.message })

  const machineKind = machine && (machine.kinematics.startsWith('lathe') ? 'lathe' : 'mill')
  const shownAxes = machine ? machine.axes.map((a) => a.name) : ['X', 'Y', 'Z']

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>{t('app.name')}</h1>
          <span>
            {t('app.tagline', {
              version: VERSION,
              mode: window.api ? t('mode.desktop', { platform: window.api.platform }) : t('mode.browser')
            })}
          </span>
        </div>
        <div className="controls">
          <label>
            {t('header.machine')}
            <select id="sel-machine" value={machineId} onChange={(e) => changeMachine(e.target.value)}>
              {cfg.machines.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
          <label>
            {t('header.control')}
            <select id="sel-control" value={controlId} onChange={(e) => changeControl(e.target.value)}>
              {cfg.controls.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          {/* Desktop picks the language in Settings > Language; the browser has no menu bar. */}
          {!window.api && (
            <label>
              {t('header.language')}
              <select
                id="sel-language"
                value={lang}
                onChange={(e) => {
                  if (isLanguage(e.target.value)) setLang(e.target.value)
                }}
              >
                {LANGUAGES.map((x) => (
                  <option key={x.code} value={x.code}>{x.label}</option>
                ))}
              </select>
            </label>
          )}
          <input ref={fileInput} type="file" hidden onChange={readInput} />
          {program && <button className="btn" onClick={showStart}>{t('action.home')}</button>}
          <button className="btn" onClick={() => void pickProgram()}>{t('action.openProgram')}</button>
          <button className="btn primary" disabled={!program} onClick={runMem}>{t('action.simulate')}</button>
        </div>
      </header>

      {!program ? (
        <StartScreen
          recent={recent.items}
          onOpenExample={openExample}
          onNew={newProgram}
          onPick={() => void pickProgram()}
          onOpenRecent={(item) => {
            void recent.open(item).then((f) => {
              if (f) openProgram(f)
            })
          }}
          onRemoveRecent={(item) => void recent.remove(item)}
        />
      ) : (
        <main className="layout" style={{ '--code-w': `${codeWidth}px` } as CSSProperties}>
          <section className="panel">
            <div className="panel-title">
              <span className="file" title={`${program.name} · ${t('program.lines', { count: lines.length })}`}>
                {dirty && <span className="dirty" title={t('program.unsaved')}>● </span>}
                {program.name}
                {program === EXAMPLE && <span className="tag">{t('start.example')}</span>}
              </span>
              <span className="modes" role="group">
                <button className={`btn tiny ${mode === 'edit' ? 'on' : ''}`} title={t('mode.editHint')} onClick={() => setMode('edit')}>EDIT</button>
                <button className={`btn tiny ${mode === 'mem' ? 'on' : ''}`} title={t('mode.memHint')} onClick={runMem}>MEM</button>
              </span>
              <span className="zoom">
                <button className="btn tiny" title={t('code.smaller')} aria-label={t('code.smaller')} onClick={() => changeFont(-0.5)}>A−</button>
                <button className="btn tiny" title={t('code.larger')} aria-label={t('code.larger')} onClick={() => changeFont(0.5)}>A+</button>
              </span>
            </div>
            {mode === 'edit' ? (
              <ProgramEditor key={programKey} ref={editor} text={program.text} fontSize={fontSize} onEdit={() => setDirty(true)} />
            ) : (
              <CodeView
                lines={lines}
                currentLine={move?.line ?? -1}
                alarmLine={stoppedBy?.line ?? -1}
                marks={marks}
                hits={hits}
                fontSize={fontSize}
                state={playing ? 'start' : sim.time > 0 && sim.time < (tl?.total ?? 0) ? 'hold' : 'reset'}
                onZoom={changeFont}
                onLineClick={jumpToLine}
              />
            )}
          </section>

          <div className="splitter" role="separator" aria-orientation="vertical" aria-label={t('layout.resize')} title={t('layout.resize')} onPointerDown={startResize} />

          <section className="panel view">
            <div className="panel-title">
              <span>{t('view.title')}</span>
              <span className="layers">
                <label>
                  <input id="layer-rapids" type="checkbox" checked={showRapids} onChange={(e) => setShowRapids(e.target.checked)} />
                  {t('layers.rapids')}
                </label>
                <label>
                  <input id="layer-stock" type="checkbox" checked={showStock} onChange={(e) => setShowStock(e.target.checked)} />
                  {t('layers.stock')}
                </label>
              </span>
            </div>
            <div className="stage">
              {machine && (
                <Viewport3D
                  machine={machine}
                  stock={setup.stock}
                  workOffsets={setup.workOffsets}
                  result={result}
                  index={index}
                  toolTip={move ? pointAlong(move, fraction) : null}
                  toolRadius={move?.toolRadius ?? 0}
                  showRapids={showRapids}
                  showStock={showStock}
                />
              )}
              <div className="legend">
                <span><i style={{ borderColor: PATH_COLORS.feed }} />{t('legend.programmed')}</span>
                <span><i style={{ borderColor: PATH_COLORS.center }} />{t('legend.center')}</span>
                <span><i style={{ borderColor: PATH_COLORS.rapid }} />{t('legend.rapid')}</span>
              </div>
              <div className="hint">{t('view.hint')}</div>
              {stoppedBy && (
                <button className="alarm-banner" onClick={() => jumpToDiagnostic(stoppedBy)}>
                  <b>
                    {t('alarm.title')} {stoppedBy.alarm?.code}
                  </b>
                  {stoppedBy.alarm?.message && <span className="machine-msg">{stoppedBy.alarm.message}</span>}
                  <span>
                    {t('alarm.line', { line: stoppedBy.line + 1 })} · {diagText(stoppedBy)}
                  </span>
                </button>
              )}
            </div>
            <Player
              time={sim.time}
              total={tl?.total ?? 0}
              playing={playing}
              speed={speed}
              disabled={!result?.moves.length}
              onSeek={seek}
              onTogglePlay={togglePlay}
              onStep={step}
              onSpeed={setSpeed}
            />
          </section>

          <aside className="panel sidebar">
            <div className="block">
              <h2>{t('project.title')}</h2>
              <p className="muted">{projectPath ? projectPath.slice(Math.max(projectPath.lastIndexOf('/'), projectPath.lastIndexOf('\\')) + 1) : t('project.none')}</p>
              <button className="btn" onClick={() => void saveProject(false)}>{t(projectPath ? 'project.save' : 'project.create')}</button>
            </div>
            <div className="block">
              <h2>{t('position.title')}</h2>
              <PositionPanel move={move} position={position} machinePosition={machinePosition} index={index} total={result?.moves.length ?? 0} axes={shownAxes} />
              {result && (
                <p className="muted">
                  {t('sim.summary', { moves: result.moves.length, time: formatTime(result.totalTimeS) })} ·{' '}
                  {result.finished ? t('sim.finished') : t('sim.stopped')}
                </p>
              )}
            </div>
            <div className="block">
              <h2>
                {t('messages.title')}
                {diagnostics.length + cfg.issues.length > 0 && <span className="count">{diagnostics.length + cfg.issues.length}</span>}
              </h2>
              {cfg.issues.map((i, k) => (
                <p key={`cfg${k}`} className="msg alarm">
                  <b>{t('severity.alarm')}</b>
                  <span>{issueText(i)}</span>
                </p>
              ))}
              {diagnostics.map((d, k) => (
                <button key={k} className={`msg ${d.severity}`} onClick={() => jumpToDiagnostic(d)}>
                  <b>{d.alarm?.code ?? t(`severity.${d.severity}`)}</b>
                  <span>
                    L{d.line + 1} · {d.alarm?.message && <strong>{d.alarm.message} · </strong>}
                    {diagText(d)}
                  </span>
                </button>
              ))}
              {!diagnostics.length && !cfg.issues.length && <p className="muted">{t('messages.none')}</p>}
            </div>
            {machine && (
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
            )}
            {control && (
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
                {machine && machineKind !== control.machineType && (
                  <p className="warning">
                    {t('control.mismatch', {
                      controlType: t(`machineType.${control.machineType}`),
                      machineType: t(`machineType.${machine.type}`)
                    })}
                  </p>
                )}
              </div>
            )}
            <div className="block">
              <h2>
                {t('stock.title')}
                <button className="btn tiny head-action" onClick={() => setEditingStock(true)}>{t('tools.edit')}</button>
              </h2>
              {setup.stock ? (
                <p className="stock-summary">
                  <i style={{ background: setup.stock.color ?? STOCK_COLOR }} />
                  {setup.stock.shape === 'cylinder'
                    ? t('stock.summaryCylinder', { diameter: setup.stock.diameter ?? 0, length: setup.stock.length ?? 0 })
                    : t('stock.summaryBlock', { x: setup.stock.x ?? 0, y: setup.stock.y ?? 0, z: setup.stock.z ?? 0 })}
                  <span className="muted"> · {setup.stock.workOffset ?? 'G54'}</span>
                </p>
              ) : (
                <p className="muted">{t('stock.none')}</p>
              )}
            </div>
            <div className="block">
              <h2>
                {t('offsets.title')}
                <button className="btn tiny head-action" onClick={() => setEditingOffsets(true)}>{t('tools.edit')}</button>
              </h2>
              {Object.keys(setup.workOffsets).length ? (
                <ul className="list mono">
                  {Object.entries(setup.workOffsets).map(([name, o]) => (
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
            <div className="block">
              <h2>
                {t('tools.title')}
                <button className="btn tiny head-action" onClick={() => setEditingTools(true)}>{t('tools.edit')}</button>
              </h2>
              {!setup.tools?.tools.length && <p className="muted">{t('tools.none')}</p>}
              <ul className="list">
                {setup.tools?.tools.map((tool) => (
                  <li key={tool.number}>
                    <b>T{String(tool.number).padStart(2, '0')}</b> {l(tool.name)}
                    <span className="muted"> · {t('tools.radius', { radius: tool.diameter / 2 })} · {tool.holder ?? t('tools.noHolder')}</span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </main>
      )}
      {editingStock && machine && (
        <StockEditor
          stock={setup.stock}
          machineDefault={defaultSetup(machine, null).stock}
          lathe={machineKind === 'lathe'}
          workOffsets={Object.keys(setup.workOffsets)}
          onApply={applyStock}
          onClose={() => setEditingStock(false)}
        />
      )}
      {editingOffsets && machine && (
        <WorkOffsetsEditor
          offsets={setup.workOffsets}
          axes={machine.axes.filter((a) => a.type === 'linear' && ['X', 'Y', 'Z'].includes(a.name)).map((a) => a.name)}
          extended={machineKind === 'mill'}
          onApply={applyOffsets}
          onClose={() => setEditingOffsets(false)}
        />
      )}
      {editingTools && (
        <ToolEditor
          tools={setup.tools}
          bundled={cfg.libraries}
          user={libraries.user}
          onSaveLibrary={libraries.save}
          onDeleteLibrary={libraries.remove}
          onApply={applyTools}
          onClose={() => setEditingTools(false)}
        />
      )}
    </div>
  )
}
