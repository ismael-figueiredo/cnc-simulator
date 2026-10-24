import {
  memo,
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
  findChuckCollisions,
  findHolderCollisions,
  holderOf,
  loadProject,
  loadToolLibrary,
  programTemplate,
  simulate,
  stockFromPath,
  supportsMacro,
  toolMount,
  workShift,
  type AlarmCatalog,
  type ConfigIssue,
  type ProgramKind,
  type Control,
  type Diagnostic,
  type Machine,
  type Severity,
  type SimulationInput,
  type Stock,
  type Tool,
  type ToolLibrary,
  type ToolOffsets,
  type WorkOffsets
} from '@core/index'
import { LANGUAGES, isLanguage } from '@i18n/index'
import type { MenuCommand, OpenedFile } from '../preload/api'
import { CodeView } from './components/CodeView'
import { ProgramEditor, type EditorHandle } from './components/ProgramEditor'
import { Player } from './components/Player'
import { PositionPanel } from './components/PositionPanel'
import { StartScreen } from './components/StartScreen'
import { NewProgramDialog } from './components/NewProgramDialog'
import { StockEditor } from './components/StockEditor'
import { ToolEditor } from './components/ToolEditor'
import { ToolOffsetsEditor } from './components/ToolOffsetsEditor'
import { WorkOffsetsEditor } from './components/WorkOffsetsEditor'
import { PATH_COLORS, Viewport3D } from './components/Viewport3D'
import { useI18n } from './i18n'
import { useLibraries } from './libraries'
import { defaultSetup, offsetsFor, projectData, setupFromProject, STOCK_COLOR, type Setup } from './project'
import { useRecent } from './recent'
import { createSimulator } from './simulation'
import { buildTimeline, formatTime, fractionOf, moveAt, pointAlong, positionAlong, type Timeline } from './playback'


// Every JSON in configs/ ships with the app: dropping a file in the folder adds it.
const machineFiles = import.meta.glob<unknown>('../../configs/machines/*.json', { eager: true, import: 'default' })
const controlFiles = import.meta.glob<unknown>('../../configs/controls/*.json', { eager: true, import: 'default' })
const toolFiles = import.meta.glob<unknown>('../../configs/tools/*.json', { eager: true, import: 'default' })
const alarmFiles = import.meta.glob<unknown>('../../configs/alarms/*.json', { eager: true, import: 'default' })
const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1)
/** The Romi GL 250 M opens first: it is the machine of the bundled O1500 example. */
const FIRST_MACHINE = 'romi-gl250-m'
// Bundled examples: each is a project (examples/*.cncsim) next to its program
const exampleProjects = import.meta.glob<string>('../../examples/*.cncsim', { eager: true, query: '?raw', import: 'default' })
const examplePrograms = import.meta.glob<string>('../../examples/*.nc', { eager: true, query: '?raw', import: 'default' })
const EXAMPLES = Object.entries(exampleProjects)
  .map(([path, text]) => {
    const r = loadProject(text, fileName(path))
    if (!r.ok) return null
    const program = examplePrograms[`../../examples/${r.value.program}`]
    return program === undefined ? null : { id: fileName(path), project: r.value, projectText: text, programText: program }
  })
  .filter((e) => e !== null)
  .sort((a, b) => a.id.localeCompare(b.id))
const isExample = (path: string) => path.startsWith('example:')


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

const NO_SIMULATION: Simulation = { timeline: null, time: 0, playing: false }

function simInput(program: Program | null, machine: Machine | undefined, control: Control | undefined, cfg: BundledConfigs, setup: Setup): SimulationInput | null {
  if (!program || !machine || !control) return null
  const alarms = cfg.alarmCatalogs.find((a) => a.id === control.alarms) ?? null
  return { text: program.text, machine, control, tools: setup.tools, alarms, workOffsets: setup.workOffsets, toolOffsets: setup.toolOffsets }
}

function run(program: Program | null, machine: Machine | undefined, control: Control | undefined, cfg: BundledConfigs, setup: Setup): Simulation {
  const input = simInput(program, machine, control, cfg, setup)
  if (!input) return NO_SIMULATION
  const timeline = buildTimeline(simulate(input))
  // Like the control after loading a program: RESET, cursor at the top, nothing run yet
  return { timeline, time: 0, playing: false }
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

type Translate = ReturnType<typeof useI18n>['t']
const configIssueText = (t: Translate, i: ConfigIssue) =>
  i.kind === 'invalid-json'
    ? t('config.invalidJson', { source: i.source, message: i.message })
    : t('config.issue', { source: i.source, path: i.path || t('config.root'), message: i.message })

interface MessagesProps {
  issues: ConfigIssue[]
  diagnostics: Diagnostic[]
  collisions: ReturnType<typeof findHolderCollisions>
  chuckCollisions: ReturnType<typeof findChuckCollisions>
  onDiagnostic: (d: Diagnostic) => void
  onMove: (moveIndex: number) => void
}

/**
 * Messages and alarms of the run. Memoized: playback re-renders the app on every frame, and a CAM
 * program can bring thousands of messages that would all be drawn again each time.
 */
const Messages = memo(function Messages({ issues, diagnostics, collisions, chuckCollisions, onDiagnostic, onMove }: MessagesProps) {
  const { t } = useI18n()
  const count = diagnostics.length + issues.length + collisions.length + chuckCollisions.length
  return (
    <div className="block">
      <h2>
        {t('messages.title')}
        {count > 0 && <span className="count">{count}</span>}
      </h2>
      {issues.map((i, k) => (
        <p key={`cfg${k}`} className="msg alarm">
          <b>{t('severity.alarm')}</b>
          <span>{configIssueText(t, i)}</span>
        </p>
      ))}
      {diagnostics.map((d, k) => (
        <button key={k} className={`msg ${d.severity}`} onClick={() => onDiagnostic(d)}>
          <b>{d.alarm?.code ?? t(`severity.${d.severity}`)}</b>
          <span>
            L{d.line + 1} · {d.alarm?.message && <strong>{d.alarm.message} · </strong>}
            {t(`diag.${d.code}`, d.params)}
          </span>
        </button>
      ))}
      {collisions.map((c) => (
        <button key={`col${c.tool}|${c.line}`} className="msg warning" onClick={() => onMove(c.moveIndex)}>
          <b>{t('collision.label')}</b>
          <span>
            L{c.line + 1} · {t('collision.holder', { tool: String(c.tool).padStart(2, '0'), depth: c.depth })}
          </span>
        </button>
      ))}
      {chuckCollisions.map((c) => (
        <button key={`chuck${c.tool}|${c.line}`} className="msg alarm" onClick={() => onMove(c.moveIndex)}>
          <b>{t('collision.label')}</b>
          <span>
            L{c.line + 1} · {t('collision.chuck', { tool: String(c.tool).padStart(2, '0'), z: c.z })}
          </span>
        </button>
      ))}
      {!count && <p className="muted">{t('messages.none')}</p>}
    </div>
  )
})

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
  /** Bumped on each edit: the path is recomputed a moment after typing stops. */
  const [editTick, setEditTick] = useState(0)
  // Stock, tools and work offsets: from the open project, or the machine's defaults
  const [setup, setSetup] = useState<Setup>(() => defaultSetup(machine, cfg.libraries))
  /** The .cncsim file the setup came from, or null for a program opened alone. */
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [sim, setSim] = useState<Simulation>(() => run(program, machine, control, cfg, setup))
  // One worker for the window's lifetime
  const [simulator] = useState(createSimulator)
  const [busy, setBusy] = useState(false)
  const [fontSize, setFontSize] = useState(() => readNumber(FONT_KEY, 11.5))
  const [codeWidth, setCodeWidth] = useState(() => readNumber(WIDTH_KEY, 300))
  const [speed, setSpeed] = useState(20)
  const [showRapids, setShowRapids] = useState(true)
  const [showStock, setShowStock] = useState(true)
  /** Lathe: chuck and part turn in C while the tool stays in X/Z (off: the part stands still). */
  const [machineView, setMachineView] = useState(true)
  /** Show the stock being cut where the tool passes. */
  const [machining, setMachining] = useState(true)
  const fileInput = useRef<HTMLInputElement>(null)
  const libraries = useLibraries()
  const [editingTools, setEditingTools] = useState(false)
  const [editingStock, setEditingStock] = useState(false)
  const [editingOffsets, setEditingOffsets] = useState(false)
  const [editingToolOffsets, setEditingToolOffsets] = useState(false)
  const [creating, setCreating] = useState(false)

  const lines = useMemo(() => (program?.text ?? '').replace(/\r/g, '').split('\n'), [program])
  /** First block of the program (skips the % leader and blank lines): where RESET puts the cursor. */
  const startLine = useMemo(() => Math.max(0, lines.findIndex((l) => l.trim() !== '' && l.trim() !== '%')), [lines])
  const tl = sim.timeline
  const result = tl?.result ?? null
  /** RESET: at the start and not running, nothing has been executed yet. */
  const atReset = sim.time <= 0 && !sim.playing
  const index = tl && !atReset ? moveAt(tl, sim.time) : -1
  const fraction = tl && index >= 0 ? fractionOf(tl, index, sim.time) : 1
  const moves = result?.moves ?? []
  const move = moves[index]
  const position = move ? positionAlong(moves[index - 1], move, fraction) : undefined
  const machinePosition = move ? positionAlong(moves[index - 1], move, fraction, (m) => m.machinePosition) : undefined

  // ---- actions (simulation is recomputed in event handlers, not in effects) ----
  /**
   * Simulates in the worker: the window stays responsive on long programs. Until the answer comes
   * the previous result stays on screen, with "Simulating…" over the 3D view.
   */
  function simulateWith(p: Program | null, m: Machine | undefined, c: Control | undefined, s: Setup = setup) {
    const input = simInput(p, m, c, cfg, s)
    if (!input) {
      simulator.cancel()
      setBusy(false)
      setSim(NO_SIMULATION)
      return
    }
    setBusy(true)
    void simulator.run(input).then((result) => {
      setBusy(false)
      // Like the control after loading a program: RESET, cursor at the top, nothing run yet
      setSim({ timeline: buildTimeline(result), time: 0, playing: false })
    })
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
    const s = defaultSetup(machine, cfg.libraries)
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
    // Desktop and examples: the program file read with it; browser files: the copy inside the project
    const text = f.text || (pr.programText ?? '')
    if (window.api && project.programMissing) window.alert(t('project.programMissing', { program: pr.program }))
    const p = { name: pr.program.slice(pr.program.lastIndexOf('/') + 1), path: f.path || pr.program, text }
    const s = setupFromProject(pr, mm, cfg.libraries)
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
  /** File > New: asks plain or parametric first (NewProgramDialog). */
  function newProgram() {
    if (canDiscard()) setCreating(true)
  }
  function createProgram(kind: ProgramKind, number: number) {
    setCreating(false)
    if (!machine || !control) return
    // Header written with the selected control's own codes, in its file format
    const text = programTemplate(machine, control, kind, number, {
      newProgram: t('template.newProgram'),
      workZero: t('template.workZero'),
      latheZero: t('template.latheZero'),
      tool: t('template.tool'),
      machineHere: t('template.machineHere'),
      parameters: t('template.parameters'),
      passes: t('template.passes'),
      length: t('template.length'),
      stepDown: t('template.stepDown'),
      totalDepth: t('template.totalDepth'),
      feed: t('template.feed'),
      startDiameter: t('template.startDiameter'),
      finalDiameter: t('template.finalDiameter')
    })
    const p = { name: `O${String(number).padStart(4, '0')}.nc`, path: '', text }
    // A new program starts from the machine's own setup: its stock and its default tools
    const s = defaultSetup(machine, cfg.libraries)
    load(p, 'edit')
    setSetup(s)
    setProjectPath(null)
    // A new program starts unsaved, so leaving it asks first
    setDirty(true)
    simulateWith(p, machine, control, s)
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
  /** EDIT, like on the control: a running program stops (it only runs in MEM). */
  function startEdit() {
    setSim((s) => ({ ...s, playing: false }))
    setMode('edit')
  }
  function edited() {
    setDirty(true)
    setEditTick((n) => n + 1)
  }
  /** MEM: take the edited text and run it, like switching the control from EDIT to MEM. */
  function runMem() {
    const p = currentProgram()
    if (p !== program) setProgram(p)
    setMode('mem')
    simulateWith(p, machine, control)
  }
  /** Bundled examples open like projects: machine, control, stock and work offsets come with them. */
  function openExample(id: string) {
    const ex = EXAMPLES.find((e) => e.id === id)
    if (!ex || !canDiscard()) return
    const path = `example:${ex.project.program}`
    openProject({ name: ex.project.program, path, text: ex.programText }, { path: `example:${ex.id}`, text: ex.projectText, programMissing: false })
  }
  function showStart() {
    if (!canDiscard()) return
    load(null)
    setProjectPath(null)
    simulateWith(null, machine, control)
  }
  function changeMachine(id: string) {
    const m = cfg.machines.find((x) => x.id === id)
    const c = cfg.controls.find((x) => x.id === m?.defaultControl) ?? control
    setMachineId(id)
    if (c) setControlId(c.id)
    // Another machine brings its own stock; tools stay unless the machine kind changes
    // (lathe tools on a machining center make no sense, and the other way round)
    const kindOf = (x: Machine | undefined) => x?.kinematics.startsWith('lathe')
    const own = defaultSetup(m, cfg.libraries)
    const sameKind = kindOf(m) === kindOf(machine)
    const s = { ...setup, stock: own.stock, tools: sameKind ? setup.tools : own.tools, toolOffsets: sameKind ? setup.toolOffsets : own.toolOffsets }
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
    // New offset numbers are measured from the tools; the ones already in the table stay as they are
    const s = { ...setup, tools: lib, toolOffsets: offsetsFor(lib, machine, setup.toolOffsets) }
    setSetup(s)
    setEditingTools(false)
    simulateWith(currentProgram(), machine, control, s)
  }
  function applyToolOffsets(toolOffsets: ToolOffsets) {
    const s = { ...setup, toolOffsets }
    setSetup(s)
    setEditingToolOffsets(false)
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
  /** Shows move k just finished. A hair before its end: exactly at the end the next move would be current. */
  const seekMove = useCallback((k: number) => {
    setSim((s) => {
      const end = s.timeline?.cumulative[k + 1] ?? 0
      const start = s.timeline?.cumulative[k] ?? 0
      return { ...s, playing: false, time: Math.max(start, end - 1e-6) }
    })
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

  // Clicking a line starts from its next execution (loops run the same line many times):
  // the tool goes to the start of that move, so Play runs that block first.
  // Reads the current move from the state itself, so the callback never changes and the program
  // screen does not re-render just because playback moved on.
  const jumpToLine = useCallback((line: number) => {
    setSim((s) => {
      const hits = s.timeline?.movesByLine.get(line)
      if (!s.timeline || !hits?.length) return s
      const current = s.time <= 0 && !s.playing ? -1 : moveAt(s.timeline, s.time)
      const next = hits.find((h) => h > current) ?? hits[0] ?? 0
      // A hair past the start, so the block counts as the current one and not as RESET
      return { ...s, playing: false, time: (s.timeline.cumulative[next] ?? 0) + 1e-6 }
    })
  }, [])

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
  // While editing, the path, messages and alarms follow the text: recomputed (at RESET)
  // a moment after typing stops, so the view never shows a program that is no longer there
  const refreshFromEditor = useEffectEvent(() => {
    if (mode === 'edit') simulateWith(currentProgram(), machine, control)
  })
  useEffect(() => {
    if (!editTick) return
    const id = setTimeout(refreshFromEditor, 700)
    return () => clearTimeout(id)
  }, [editTick])

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
  const jumpToDiagnostic = useCallback(
    (d: Diagnostic) => {
      if (tl?.movesByLine.has(d.line)) jumpToLine(d.line)
      else if (d.moveIndex !== undefined) {
        if (d.moveIndex > 0) seekMove(d.moveIndex - 1)
        else seek(0)
      }
    },
    [tl, jumpToLine, seekMove, seek]
  )
  const stoppedBy = result?.stoppedBy
  const issueText = (i: ConfigIssue) => configIssueText(t, i)

  const machineKind = machine && (machine.kinematics.startsWith('lathe') ? 'lathe' : 'mill')
  const shownAxes = machine ? machine.axes.map((a) => a.name) : ['X', 'Y', 'Z']
  const lathe = machineKind === 'lathe'

  // ---- tool in the spindle, holder and possible holder collisions ----
  const toolTip = move ? pointAlong(move, fraction) : null
  const libraryTool = move ? setup.tools?.tools.find((x) => x.number === move.state.tool) : undefined
  // A T word without a library entry still gets a body, sized by the compensation radius
  const currentTool: Tool | undefined =
    libraryTool ?? (move && move.state.tool > 0 ? { number: move.state.tool, name: '', type: 'flat-endmill', diameter: Math.max(1, move.toolRadius * 2), length: 40 } : undefined)
  const holder = currentTool ? holderOf(currentTool, setup.tools, lathe) : undefined
  const mount = currentTool ? toolMount(currentTool, holder, lathe) : 'axial'
  const collisions = useMemo(() => {
    const s = setup.stock
    const shift = workShift(setup.workOffsets, s?.workOffset ?? 'G54')
    return findHolderCollisions({
      moves: result?.moves ?? [],
      tools: setup.tools,
      stock: s,
      stockZero: lathe ? [0, 0, shift.Z] : [shift.X, shift.Y, shift.Z],
      lathe
    })
  }, [result, setup, lathe])
  const colliding = !!move && collisions.some((c) => c.line === move.line && c.tool === move.state.tool)
  const chuckCollisions = useMemo(() => {
    if (!lathe) return []
    const shift = workShift(setup.workOffsets, setup.stock?.workOffset ?? 'G54')
    return findChuckCollisions(result?.moves ?? [], setup.stock, [0, 0, shift.Z])
  }, [result, setup, lathe])
  const chuckHit = !!move && chuckCollisions.some((c) => c.line === move.line && c.tool === move.state.tool)
  const ballTools = useMemo(() => new Set(setup.tools?.tools.filter((x) => x.type === 'ball-endmill').map((x) => x.number) ?? []), [setup.tools])
  /** Stock wrapping what the program cuts, offered in the stock editor. */
  const programStock = useMemo(() => stockFromPath(result?.moves ?? [], lathe), [result, lathe])
  // C angle: from the tip in polar interpolation (C is not tracked as an angle there), else the C position
  const spindleAngle = move ? (move.state.polar && toolTip ? Math.atan2(toolTip[1], toolTip[0]) : ((position?.C ?? 0) * Math.PI) / 180) : 0
  const spinning = playing && !!move?.state.spindleOn && !move.state.liveToolOn

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>{t('app.name')}</h1>
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
        </div>
      </header>

      {!program ? (
        <StartScreen
          recent={recent.items}
          examples={EXAMPLES.map((e) => ({ id: e.id, name: e.project.program, detail: l(e.project.description ?? '') }))}
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
                {isExample(program.path) && <span className="tag">{t('start.example')}</span>}
              </span>
              <span className="modes" role="group">
                <button className={`btn tiny ${mode === 'edit' ? 'on' : ''}`} title={t('mode.editHint')} onClick={startEdit}>EDIT</button>
                <button className={`btn tiny ${mode === 'mem' ? 'on' : ''}`} title={t('mode.memHint')} onClick={runMem}>MEM</button>
              </span>
              <button className="btn tiny icon-btn" title={t('program.saveHint')} aria-label={t('program.saveHint')} onClick={() => void save(false)}>
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
                  <path d="M2 1.5h9.5L14.5 4.5V14a.5.5 0 0 1-.5.5H2a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5Z" fill="none" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M4.5 1.5v4h6v-4M4 14.5V9.5h8v5" fill="none" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              </button>
              <span className="zoom">
                <button className="btn tiny" title={t('code.smaller')} aria-label={t('code.smaller')} onClick={() => changeFont(-0.5)}>A−</button>
                <button className="btn tiny" title={t('code.larger')} aria-label={t('code.larger')} onClick={() => changeFont(0.5)}>A+</button>
              </span>
            </div>
            {mode === 'edit' ? (
              <ProgramEditor key={programKey} ref={editor} text={program.text} fontSize={fontSize} onEdit={edited} />
            ) : (
              <CodeView
                lines={lines}
                currentLine={move?.line ?? (atReset ? startLine : -1)}
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
                <label title={t('layers.machiningHint')}>
                  <input id="layer-machining" type="checkbox" checked={machining} onChange={(e) => setMachining(e.target.checked)} />
                  {t('layers.machining')}
                </label>
                {lathe && (
                  <label title={t('layers.machineViewHint')}>
                    <input id="layer-machine-view" type="checkbox" checked={machineView} onChange={(e) => setMachineView(e.target.checked)} />
                    {t('layers.machineView')}
                  </label>
                )}
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
                  toolTip={toolTip}
                  toolRadius={move?.toolRadius ?? 0}
                  tool={currentTool}
                  holder={holder}
                  mount={mount}
                  colliding={colliding}
                  machineView={machineView}
                  spindleAngle={spindleAngle}
                  spinning={spinning}
                  machining={machining}
                  ballTools={ballTools}
                  chuckHit={chuckHit}
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
              {mode === 'edit' && <div className="edit-note">{t('view.editNote')}</div>}
              {busy && <div className="busy-note">{t('sim.running')}</div>}
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
              runDisabled={mode === 'edit'}
              onSeek={seek}
              onTogglePlay={togglePlay}
              onStep={step}
              onSpeed={setSpeed}
            />
          </section>

          <aside className="panel sidebar">
            <div className="block">
              <h2>{t('project.title')}</h2>
              <p className="muted">
                {projectPath ? projectPath.slice(Math.max(projectPath.lastIndexOf('/'), projectPath.lastIndexOf('\\'), projectPath.indexOf(':')) + 1) : t('project.none')}
              </p>
              <button className="btn" title={t('project.explain')} onClick={() => void saveProject(false)}>{t(projectPath ? 'project.save' : 'project.create')}</button>
              <p className="muted small">{t('project.explain')}</p>
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
            <Messages
              issues={cfg.issues}
              diagnostics={diagnostics}
              collisions={collisions}
              chuckCollisions={chuckCollisions}
              onDiagnostic={jumpToDiagnostic}
              onMove={seekMove}
            />
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
                {t('toolOffsets.title')}
                <button className="btn tiny head-action" onClick={() => setEditingToolOffsets(true)}>{t('tools.edit')}</button>
              </h2>
              <ul className="list mono">
                {Object.entries(setup.toolOffsets)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .slice(0, 8)
                  .map(([n, o]) => (
                    <li key={n}>
                      <b>{n.padStart(2, '0')}</b>{' '}
                      {lathe
                        ? `X${o.x ?? 0} Z${o.z ?? 0}${o.nose !== undefined ? ` R${o.nose}` : ''}${o.xWear || o.zWear ? ` · Δ X${o.xWear ?? 0} Z${o.zWear ?? 0}` : ''}`
                        : `H${o.length ?? '—'}${o.lengthWear ? `${o.lengthWear > 0 ? '+' : ''}${o.lengthWear}` : ''} D${o.radius ?? '—'}${o.radiusWear ? `${o.radiusWear > 0 ? '+' : ''}${o.radiusWear}` : ''}`}
                    </li>
                  ))}
              </ul>
              {!Object.keys(setup.toolOffsets).length && <p className="muted">{t('toolOffsets.none')}</p>}
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
          machineDefault={defaultSetup(machine, []).stock}
          lathe={machineKind === 'lathe'}
          fromProgram={programStock}
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
      {creating && machine && control && (
        <NewProgramDialog
          machine={machine.name}
          control={control.name}
          macro={supportsMacro(control)}
          onCreate={createProgram}
          onClose={() => setCreating(false)}
        />
      )}
      {editingToolOffsets && (
        <ToolOffsetsEditor
          offsets={setup.toolOffsets}
          measured={offsetsFor(setup.tools, machine)}
          lathe={lathe}
          onApply={applyToolOffsets}
          onClose={() => setEditingToolOffsets(false)}
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
