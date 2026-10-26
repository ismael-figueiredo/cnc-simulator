import type { MenuCommand, OpenedFile, RecentItem } from '../../preload/api'

export interface SaveProjectInput {
  /** Project fields except the program, which each platform stores its own way. */
  project: Record<string, unknown>
  /** Current project file (or download name), or null for a new one. */
  projectPath: string | null
  program: { name: string; path: string; text: string }
}

/**
 * What the window needs from where it runs: the desktop app (native menus, dialogs, files on disk)
 * or the browser (server mode: file picker, downloads, localStorage). The UI only talks to this.
 */
export interface Platform {
  /** Native menus and files on disk. False in the browser, which shows its own File buttons. */
  desktop: boolean
  /** "darwin", "win32"… on the desktop; '' in the browser. */
  os: string
  /** Lets the user pick a program or project; null if cancelled. */
  openFile: () => Promise<OpenedFile | null>
  /** Desktop: writes the file (asks where when needed). Browser: downloads it. Null if cancelled. */
  saveProgram: (file: OpenedFile, saveAs: boolean) => Promise<OpenedFile | null>
  /** Returns the project's path (or download name), or null if cancelled. */
  saveProject: (input: SaveProjectInput, saveAs: boolean) => Promise<string | null>
  /** Desktop: a project points to its program file, so the program must be saved to disk first. */
  projectNeedsProgramFile: boolean
  libraries: {
    /** The user's tool libraries as JSON texts (validated by the caller). */
    list: () => Promise<string[]>
    save: (id: string, json: string) => Promise<void>
    remove: (id: string) => Promise<void>
  }
  recent: {
    list: () => Promise<RecentItem[]>
    /** Reads a recent file again; null if it is gone. */
    open: (item: RecentItem) => Promise<OpenedFile | null>
    remove: (item: RecentItem) => Promise<void>
    /** A program the window opened by itself (the desktop records files when it reads them). */
    record: (file: OpenedFile) => void
    onChange: (listener: (items: RecentItem[]) => void) => () => void
  }
  /** Unsaved changes: the desktop asks before closing the window. */
  setDirty: (dirty: boolean) => void
  setLanguage: (lang: string) => void
  onLanguageChanged: (listener: (lang: string) => void) => () => void
  onMenuCommand: (listener: (command: MenuCommand) => void) => () => void
  onFileOpened: (listener: (file: OpenedFile) => void) => () => void
  onShowStart: (listener: () => void) => () => void
}
