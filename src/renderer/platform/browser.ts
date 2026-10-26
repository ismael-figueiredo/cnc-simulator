import type { OpenedFile, RecentItem } from '../../preload/api'
import { readJson, writeJson, type KeyValueStore } from './storage'
import type { Platform } from './types'

// Browser (server mode): no paths on disk. Files come from a file picker and go to the downloads
// folder; the recent list keeps the program text itself, and tool libraries live in the store.

const RECENT_KEY = 'cncsim.recent'
const LIBRARIES_KEY = 'cncsim.toolLibraries'
const MAX_RECENT = 8
/** Larger programs are listed without their text and must be picked again. */
const MAX_RECENT_TEXT = 300_000

interface RecentEntry extends RecentItem {
  text?: string
}

export interface BrowserDeps {
  store: KeyValueStore
  /** Hands a file to the downloads folder. */
  download: (name: string, text: string, type: string) => void
  /** The file the user picked, or null if cancelled. */
  pickFile: () => Promise<{ name: string; text: string } | null>
  now?: () => number
}

const isArray = (v: unknown): v is RecentEntry[] => Array.isArray(v)
const isRecord = (v: unknown): v is Record<string, string> => typeof v === 'object' && v !== null && !Array.isArray(v)
const toItems = (entries: RecentEntry[]): RecentItem[] => entries.map(({ text, ...item }) => ({ ...item, missing: text === undefined }))

export function browserPlatform({ store, download, pickFile, now = Date.now }: BrowserDeps): Platform {
  const listeners = new Set<(items: RecentItem[]) => void>()
  const readRecent = () => readJson(store, RECENT_KEY, [], isArray)
  const writeRecent = (entries: RecentEntry[]) => {
    writeJson(store, RECENT_KEY, entries)
    const items = toItems(entries)
    for (const l of listeners) l(items)
  }
  const readLibraries = () => readJson(store, LIBRARIES_KEY, {}, isRecord)

  const record = (file: OpenedFile) => {
    const entry: RecentEntry = {
      path: file.path,
      name: file.name,
      kind: 'program',
      openedAt: now(),
      ...(file.text.length <= MAX_RECENT_TEXT ? { text: file.text } : {})
    }
    writeRecent([entry, ...readRecent().filter((e) => e.path !== file.path)].slice(0, MAX_RECENT))
  }

  return {
    desktop: false,
    os: '',
    async openFile() {
      const f = await pickFile()
      if (!f) return null
      return f.name.toLowerCase().endsWith('.cncsim')
        ? { name: f.name, path: '', text: '', project: { path: f.name, text: f.text, programMissing: false } }
        : { name: f.name, path: f.name, text: f.text }
    },
    saveProgram(file) {
      download(file.name, file.text, 'text/plain')
      record(file)
      return Promise.resolve(file)
    },
    saveProject({ project, projectPath, program }) {
      // No program file to point to: the project carries a copy of the program
      const name = projectPath ?? `${program.name.replace(/\.[^.]+$/, '')}.cncsim`
      download(name, JSON.stringify({ ...project, program: program.name, programText: program.text }, null, 2), 'application/json')
      return Promise.resolve(name)
    },
    projectNeedsProgramFile: false,
    libraries: {
      list: () => Promise.resolve(Object.values(readLibraries())),
      save(id, json) {
        writeJson(store, LIBRARIES_KEY, { ...readLibraries(), [id]: json })
        return Promise.resolve()
      },
      remove(id) {
        const { [id]: _removed, ...rest } = readLibraries()
        writeJson(store, LIBRARIES_KEY, rest)
        return Promise.resolve()
      }
    },
    recent: {
      list: () => Promise.resolve(toItems(readRecent())),
      open(item) {
        const entry = readRecent().find((e) => e.path === item.path)
        return Promise.resolve(entry?.text === undefined ? null : { name: entry.name, path: entry.path, text: entry.text })
      },
      remove(item) {
        writeRecent(readRecent().filter((e) => e.path !== item.path))
        return Promise.resolve()
      },
      record,
      onChange(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      }
    },
    setDirty: () => undefined,
    setLanguage: () => undefined,
    // No native menu: the window handles the keys and shows its own buttons
    onLanguageChanged: () => () => undefined,
    onMenuCommand: () => () => undefined,
    onFileOpened: () => () => undefined,
    onShowStart: () => () => undefined
  }
}
