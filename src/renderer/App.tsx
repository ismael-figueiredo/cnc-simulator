import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { isLathe, loadProject, machineKind, suggestSetup, workZero, type ConfigIssue, type LastChoice, type Machine, type ProgramKind, type Stock, type WorkOffsets } from '@core/index'
import { LANGUAGES, isLanguage } from '@i18n/index'
import type { MenuCommand, OpenedFile, RecentItem } from '../preload/api'
import { EXAMPLES, EXERCISES, loadBundled } from './bundled'
import { HelpMenu, ShortcutsDialog } from './components/HelpMenu'
import { NewProgramDialog } from './components/NewProgramDialog'
import { OpenProgramDialog } from './components/OpenProgramDialog'
import type { SetupChoice } from './components/SetupPicker'
import { FileIcon, StartScreen, type StartSection } from './components/StartScreen'
import { Tour } from './components/Tour'
import { useI18n } from './i18n'
import { useLibraries } from './libraries'
import { readJson, storage, usePlatform } from './platform'
import { defaultSetup, setupFromProject, type Setup } from './project'
import { useRecent } from './recent'
import { simulationInput } from './simulationInput'
import { readThumb, thumbKey } from './thumbnail'
import { usePartThumbnails, type ThumbJob } from './useThumbnails'
import type { DocInit } from './documentStart'
import { Workspace, type DocState, type Layout, type WorkspaceHandle } from './Workspace'

const LAYOUT_KEY = 'cncsim.layout'
const LEARN_KEY = 'cncsim.learn'
const TOUR_KEY = 'cncsim.tourDone'
const LAST_KEY = 'cncsim.lastSetup'
/** Open documents at most: each keeps its program, simulation and 3D data in memory. */
const MAX_TABS = 8

const read = storage.get
const write = storage.set
// "cam" was the 3D model layout's former name
const readLayout = (): Layout => (read(LAYOUT_KEY) === 'cam' || read(LAYOUT_KEY) === 'model' ? 'model' : 'machine')
const readLast = (): LastChoice => readJson(storage, LAST_KEY, {}, (v): v is LastChoice => typeof v === 'object' && v !== null)

/** A tab: the start screen, or an open document. */
type Tab = { id: number; kind: 'start' } | { id: number; kind: 'doc'; init: DocInit; state: DocState }

let nextId = 1

/** The window: document tabs, the start screen, the File menu's dialogs and app-wide settings. */
export function App() {
  const { lang, setLang, t, l } = useI18n()
  const platform = usePlatform()
  // Re-validated on language change so schema messages come out in the new language
  const cfg = useMemo(() => loadBundled(lang), [lang])
  const recent = useRecent()
  const libraries = useLibraries()
  const [tabs, setTabs] = useState<Tab[]>(() => [{ id: nextId++, kind: 'start' }])
  const [activeId, setActiveId] = useState(() => tabs[0]?.id ?? 0)
  const active = tabs.find((x) => x.id === activeId) ?? tabs[0]
  const handles = useRef(new Map<number, WorkspaceHandle>())
  const [section, setSection] = useState<StartSection>('recent')
  const [layout, setLayout] = useState<Layout>(readLayout)
  const [learn, setLearn] = useState(() => read(LEARN_KEY) === '1')
  const [tour, setTour] = useState(-1)
  const [shortcuts, setShortcuts] = useState(false)
  /** A program waiting for its machine and control (Open program dialog). */
  const [pending, setPending] = useState<OpenedFile | null>(null)
  const [creating, setCreating] = useState(false)

  const changeLayout = (next: Layout) => {
    setLayout(next)
    write(LAYOUT_KEY, next)
  }
  const changeLearn = useCallback((on: boolean) => {
    setLearn(on)
    write(LEARN_KEY, on ? '1' : '0')
  }, [])
  const closeTour = () => {
    setTour(-1)
    write(TOUR_KEY, '1')
  }

  // ---- tabs ----
  /** Opens a document: in the start tab when that is in front, else in a new tab. */
  function addDoc(init: DocInit) {
    const docs = tabs.filter((x) => x.kind === 'doc').length
    if (docs >= MAX_TABS && active?.kind !== 'start') {
      window.alert(t('tabs.tooMany', { max: MAX_TABS }))
      return
    }
    const tab: Tab = { id: nextId++, kind: 'doc', init, state: { title: '', dirty: false, kind: init.kind === 'project' ? 'project' : 'program' } }
    setTabs((list) => (active?.kind === 'start' ? list.map((x) => (x.id === active.id ? tab : x)) : [...list, tab]))
    setActiveId(tab.id)
    // The first document ever opened shows the tour once
    if (read(TOUR_KEY) !== '1') setTour(0)
  }
  function newTab(s: StartSection = section) {
    const existing = tabs.find((x) => x.kind === 'start')
    setSection(s)
    if (existing) {
      setActiveId(existing.id)
      return
    }
    const tab: Tab = { id: nextId++, kind: 'start' }
    setTabs((list) => [...list, tab])
    setActiveId(tab.id)
  }
  function closeTab(id: number) {
    const tab = tabs.find((x) => x.id === id)
    if (!tab) return
    if (tab.kind === 'doc' && !(handles.current.get(id)?.canClose() ?? true)) return
    const rest = tabs.filter((x) => x.id !== id)
    if (!rest.length) {
      const start: Tab = { id: nextId++, kind: 'start' }
      setTabs([start])
      setActiveId(start.id)
      return
    }
    setTabs(rest)
    if (id === activeId) setActiveId(rest[Math.max(0, tabs.indexOf(tab) - 1)]?.id ?? rest[0]?.id ?? 0)
  }
  /** Each tab reports its name and unsaved state; unchanged reports leave the list as it is. */
  const onDocState = useCallback((id: number, state: DocState) => {
    setTabs((list) => {
      const tab = list.find((x) => x.id === id)
      if (tab?.kind !== 'doc' || (tab.state.title === state.title && tab.state.dirty === state.dirty && tab.state.kind === state.kind)) return list
      return list.map((x) => (x.id === id ? { ...tab, state } : x))
    })
  }, [])
  const anyDirty = tabs.some((x) => x.kind === 'doc' && x.state.dirty)
  // The main process asks before closing the window with unsaved edits in any tab
  useEffect(() => {
    platform.setDirty(anyDirty)
  }, [platform, anyDirty])

  // ---- opening files ----
  const issueText = (i: ConfigIssue) =>
    i.kind === 'invalid-json' ? t('config.invalidJson', { source: i.source, message: i.message }) : t('config.issue', { source: i.source, path: i.path || t('config.root'), message: i.message })
  /** A project opens as it is; a program alone first asks for its machine and control. */
  function openFile(f: OpenedFile) {
    if (!f.project) {
      setPending(f)
      return
    }
    const r = loadProject(f.project.text, f.project.path)
    if (!r.ok) {
      window.alert(`${t('project.invalid')}\n\n${r.issues.map(issueText).join('\n')}`)
      return
    }
    const pr = r.value
    if (!cfg.machines.some((m) => m.id === pr.machine) || !cfg.controls.some((c) => c.id === pr.control))
      window.alert(t('project.unknownConfig', { machine: pr.machine, control: pr.control }))
    if (platform.desktop && f.project.programMissing) window.alert(t('project.programMissing', { program: pr.program }))
    // Desktop and examples: the program file read with it; browser files: the copy inside the project
    const text = f.text || (pr.programText ?? '')
    addDoc({ kind: 'project', program: { name: pr.program.slice(pr.program.lastIndexOf('/') + 1), path: f.path || pr.program, text }, project: pr, projectPath: f.project.path })
  }
  function openPending(choice: SetupChoice) {
    if (!pending) return
    const machine = cfg.machines.find((m) => m.id === choice.machineId)
    const library = [...cfg.libraries, ...libraries.user].find((x) => x.id === choice.libraryId) ?? null
    const kind = machine ? machineKind(machine) : 'mill'
    write(LAST_KEY, JSON.stringify({ ...readLast(), [kind]: { machineId: choice.machineId, controlId: choice.controlId } }))
    const program = { name: pending.name, path: pending.path, text: pending.text }
    recent.record(program)
    setPending(null)
    addDoc({ kind: 'program', program, machineId: choice.machineId, controlId: choice.controlId, library })
  }
  function createProgram(programKind: ProgramKind, number: number, choice: SetupChoice) {
    setCreating(false)
    const machine = cfg.machines.find((m) => m.id === choice.machineId)
    const kind = machine ? machineKind(machine) : 'mill'
    write(LAST_KEY, JSON.stringify({ ...readLast(), [kind]: { machineId: choice.machineId, controlId: choice.controlId } }))
    addDoc({ kind: 'new', machineId: choice.machineId, controlId: choice.controlId, programKind, number })
  }
  function openExample(id: string) {
    const ex = EXAMPLES.find((e) => e.id === id)
    if (!ex) return
    openFile({ name: ex.project.program, path: `example:${ex.project.program}`, text: ex.programText, project: { path: `example:${ex.id}`, text: ex.projectText, programMissing: false } })
  }
  async function pickFile() {
    const r = await platform.openFile()
    if (r) openFile(r)
  }
  function openRecent(item: RecentItem) {
    void recent.open(item).then((f) => {
      if (f) openFile(f)
    })
  }
  const lastFor = () => {
    const last = readLast()
    const c = last.mill ?? last.lathe
    const m = cfg.machines.find((x) => x.id === c?.machineId) ?? cfg.machines[0]
    return { machineId: m?.id ?? '', controlId: c?.controlId ?? m?.defaultControl ?? '', libraryId: m?.defaultTools ?? '' }
  }

  // ---- menus and keys ----
  const onCommand = useEffectEvent((command: MenuCommand) => {
    if (command === 'new') setCreating(true)
    else if (command === 'open') void pickFile()
    else if (command === 'home') newTab()
    else if (command === 'start:examples') newTab('examples')
    else if (command === 'start:exercises') newTab('exercises')
    else if (command === 'closeTab') closeTab(activeId)
    else if (command === 'layout:machine' || command === 'layout:model') changeLayout(command === 'layout:machine' ? 'machine' : 'model')
    else if (command === 'learn') changeLearn(!learn)
    else if (command === 'tour') setTour(0)
    else if (command === 'shortcuts') setShortcuts(true)
    else handles.current.get(activeId)?.command(command)
  })
  useEffect(() => platform.onMenuCommand(onCommand), [platform])
  const onMenuOpen = useEffectEvent((f: OpenedFile) => openFile(f))
  useEffect(() => platform.onFileOpened(onMenuOpen), [platform])
  const onMenuHome = useEffectEvent(() => newTab())
  useEffect(() => platform.onShowStart(onMenuHome), [platform])
  // Browser mode has no native menu: the same shortcuts from the keyboard
  useEffect(() => {
    if (platform.desktop) return
    const key = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 's') onCommand(e.altKey ? 'saveProject' : e.shiftKey ? 'saveAs' : 'save')
      else if (k === 'o') onCommand('open')
      else if (k === 'n' && e.altKey) onCommand('new') // Ctrl+N opens a browser window
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [platform])

  // Pictures of the finished parts: the examples, and what each exercise should become
  const thumbJobs = useMemo(() => {
    const job = (key: string, text: string, machine: Machine | undefined, controlId: string, stock: Stock | null | undefined, workOffsets: WorkOffsets, tools: Setup['tools'], toolOffsets: Setup['toolOffsets']): ThumbJob | null => {
      const control = cfg.controls.find((c) => c.id === controlId)
      if (!machine || !control || !stock) return null
      const lathe = isLathe(machine)
      const input = simulationInput(text, machine, control, cfg.alarmCatalogs, { tools, workOffsets, toolOffsets })
      return { key: thumbKey(key, text, machine.id, controlId, JSON.stringify(stock)), input, stock, zero: workZero(workOffsets, stock.workOffset ?? 'G54', lathe), lathe }
    }
    const examples = EXAMPLES.map((e) => {
      const m = cfg.machines.find((x) => x.id === e.project.machine)
      const setup = setupFromProject(e.project, m, cfg.libraries)
      return [`example:${e.id}`, job(`example:${e.id}`, e.programText, m, e.project.control, setup.stock, setup.workOffsets, setup.tools, setup.toolOffsets)] as const
    })
    const exercises = EXERCISES.map((e) => {
      const m = cfg.machines.find((x) => x.id === e.exercise.machine)
      const setup = defaultSetup(m, cfg.libraries)
      return [`exercise:${e.id}`, job(`exercise:${e.id}`, e.exercise.solution, m, e.exercise.control, e.exercise.stock, e.exercise.workOffsets ?? {}, setup.tools, setup.toolOffsets)] as const
    })
    const all = [...examples, ...exercises]
    return { jobs: all.flatMap(([, j]) => (j ? [j] : [])), keys: new Map(all.flatMap(([id, j]) => (j ? [[id, j.key] as const] : []))) }
  }, [cfg])
  const thumbs = usePartThumbnails(thumbJobs.jobs)
  const thumbOf = (kind: 'example' | 'exercise', id: string) => thumbs[thumbJobs.keys.get(`${kind}:${id}`) ?? '']
  const suggestion = useMemo(() => (pending ? suggestSetup(pending.text, cfg.machines, cfg.controls, readLast()) : null), [pending, cfg])
  const isDoc = active?.kind === 'doc'

  return (
    <div className="app">
      <header className="titlebar">
        <span className="brand-mark" aria-label="CNC Simulator">
          <img src="favicon.png" alt="" />
          <span>CNC Simulator</span>
        </span>
        <nav className="doc-tabs" role="tablist" aria-label={t('tabs.label')}>
          {tabs.map((tab) => (
            <div key={tab.id} role="tab" aria-selected={tab.id === activeId} className={`doc-tab ${tab.id === activeId ? 'on' : ''}`}>
              <button className="tab-label" title={tab.kind === 'doc' ? t(tab.state.kind === 'project' ? 'file.projectHint' : 'file.programHint') : undefined} onClick={() => setActiveId(tab.id)}>
                {tab.kind === 'doc' ? <FileIcon kind={tab.state.kind} /> : null}
                <span>{tab.kind === 'start' ? t('tabs.start') : tab.state.title}</span>
                {tab.kind === 'doc' && tab.state.dirty && <span className="dirty" title={t('program.unsaved')}>●</span>}
              </button>
              <button className="tab-close" title={t('menu.closeTab')} aria-label={t('menu.closeTab')} onClick={() => closeTab(tab.id)}>×</button>
            </div>
          ))}
          <button className="tab-new" title={t('tabs.new')} aria-label={t('tabs.new')} onClick={() => newTab()}>+</button>
        </nav>
        <div className="titlebar-right">
          {/* Browser mode has no menu bar: the File menu's main actions and the language are here */}
          {!platform.desktop && (
            <span className="browser-file">
              <button className="btn tiny" onClick={() => setCreating(true)}>{t('action.newProgram')}</button>
              <button className="btn tiny" onClick={() => void pickFile()}>{t('action.open')}</button>
              {isDoc && <button className="btn tiny" onClick={() => handles.current.get(activeId)?.command('save')}>{t('menu.save')}</button>}
              <select
                id="sel-language"
                value={lang}
                aria-label={t('header.language')}
                onChange={(e) => {
                  if (isLanguage(e.target.value)) setLang(e.target.value)
                }}
              >
                {LANGUAGES.map((x) => (
                  <option key={x.code} value={x.code}>{x.label}</option>
                ))}
              </select>
            </span>
          )}
          {isDoc && (
            <span className="layout-switch" role="group" aria-label={t('layout.label')}>
              <button className={layout === 'machine' ? 'on' : ''} aria-pressed={layout === 'machine'} title={t('layout.machineHint')} onClick={() => changeLayout('machine')}>
                {t('layout.machine')}
              </button>
              <button className={layout === 'model' ? 'on' : ''} aria-pressed={layout === 'model'} title={t('layout.modelHint')} onClick={() => changeLayout('model')}>
                {t('layout.model')}
              </button>
            </span>
          )}
          <HelpMenu learn={learn} onLearn={changeLearn} onTour={() => setTour(0)} onShortcuts={() => setShortcuts(true)} />
        </div>
      </header>

      {tabs.map((tab) =>
        tab.kind === 'doc' ? (
          <Workspace
            key={tab.id}
            ref={(h) => {
              if (h) handles.current.set(tab.id, h)
              else handles.current.delete(tab.id)
            }}
            init={tab.init}
            cfg={cfg}
            active={tab.id === activeId}
            layout={layout}
            learn={learn}
            onLearn={changeLearn}
            onHelp={() => setTour(0)}
            onState={(s) => onDocState(tab.id, s)}
          />
        ) : tab.id === activeId ? (
          <StartScreen
            key={tab.id}
            section={section}
            onSection={setSection}
            recent={recent.items}
            examples={EXAMPLES.map((e) => ({
              id: e.id,
              name: e.project.program,
              detail: l(e.project.description ?? ''),
              machine: cfg.machines.find((m) => m.id === e.project.machine)?.name ?? e.project.machine,
              thumb: thumbOf('example', e.id)
            }))}
            exercises={EXERCISES.map((e) => ({ id: e.id, name: l(e.exercise.title), level: e.exercise.level, detail: l(e.exercise.statement).split('\n')[0] ?? '', thumb: thumbOf('exercise', e.id) }))}
            recentThumb={(item) => readThumb(thumbKey('path', item.path)) ?? undefined}
            onNew={() => setCreating(true)}
            onOpen={() => void pickFile()}
            onOpenRecent={openRecent}
            onRemoveRecent={(item) => void recent.remove(item)}
            onOpenExample={openExample}
            onOpenExercise={(id) => addDoc({ kind: 'exercise', id })}
          />
        ) : null
      )}

      {isDoc && tour >= 0 && <Tour step={tour} onStep={setTour} onClose={closeTour} />}
      {shortcuts && <ShortcutsDialog onClose={() => setShortcuts(false)} />}
      {pending && (
        <OpenProgramDialog
          name={pending.name}
          machines={cfg.machines}
          controls={cfg.controls}
          libraries={[...cfg.libraries, ...libraries.user]}
          suggestion={suggestion}
          onOpen={openPending}
          onCancel={() => setPending(null)}
        />
      )}
      {creating && <NewProgramDialog machines={cfg.machines} controls={cfg.controls} initial={lastFor()} onCreate={createProgram} onClose={() => setCreating(false)} />}
    </div>
  )
}
