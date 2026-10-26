// Contract between the window (renderer) and the main process. Used by both sides.

export interface OpenedFile {
  name: string
  path: string
  text: string
  /** Set when a project (.cncsim) was opened: name, path and text above are its program's. */
  project?: { path: string; text: string; programMissing: boolean }
}

export interface SaveProjectRequest {
  /** Project fields except `program`, which the main process writes relative to the project file. */
  project: Record<string, unknown>
  /** Current project file, or '' for a new one. */
  projectPath: string
  programPath: string
}

/** A file in File > Open recent and on the start screen. */
export interface RecentItem {
  path: string
  name: string
  kind: 'program' | 'project'
  openedAt: number
  /** The file was moved or deleted since it was opened. */
  missing?: boolean
}

/** Menu items handled by the window: the File menu's document actions, the View menu and the tour. */
export type MenuCommand =
  | 'new'
  | 'open'
  | 'save'
  | 'saveAs'
  | 'saveProject'
  | 'closeTab'
  | 'home'
  | 'start:examples'
  | 'start:exercises'
  | 'layout:machine'
  | 'layout:model'
  | 'learn'
  | 'tour'
  | 'shortcuts'
  | 'view:iso'
  | 'view:top'
  | 'view:front'
  | 'view:side'

export interface CncApi {
  /** Shows the system dialog and returns the chosen program, or null if cancelled. */
  openFile: () => Promise<OpenedFile | null>
  /**
   * Writes the program. Without a usable path, or with saveAs, shows the save dialog first.
   * Returns the saved file (new name and path), or null if cancelled.
   */
  saveFile: (file: OpenedFile, saveAs: boolean) => Promise<OpenedFile | null>
  /** Writes the project file (asks where for a new one or with saveAs). Returns its path, or null if cancelled. */
  saveProject: (request: SaveProjectRequest, saveAs: boolean) => Promise<string | null>
  /** The user's tool libraries, as JSON texts (validated by the caller). */
  listLibraries: () => Promise<string[]>
  saveLibrary: (id: string, json: string) => Promise<void>
  deleteLibrary: (id: string) => Promise<void>
  /** Unsaved changes: closing the window asks first. */
  setDirty: (dirty: boolean) => Promise<void>
  onMenuCommand: (listener: (command: MenuCommand) => void) => () => void
  /** Recently opened files, newest first. */
  listRecent: () => Promise<RecentItem[]>
  /** Reads a recent file again from disk; null if it no longer exists. */
  openRecent: (path: string) => Promise<OpenedFile | null>
  removeRecent: (path: string) => Promise<RecentItem[]>
  /** Called when the recent list changes (a file was opened from the menu or a dialog). */
  onRecentChanged: (listener: (items: RecentItem[]) => void) => () => void
  /** Called on File > Home: go back to the start screen. */
  onShowStart: (listener: () => void) => () => void
  /** Tells the main process the UI language, so native menus and dialogs follow it. */
  setLanguage: (lang: string) => Promise<void>
  /** Called when the user picks a language in the native Language menu. Returns an unsubscribe function. */
  onLanguageChanged: (listener: (lang: string) => void) => () => void
  /** Called when a program is opened from the native File menu. Returns an unsubscribe function. */
  onFileOpened: (listener: (file: OpenedFile) => void) => () => void
  platform: string
}

export const CHANNELS = {
  openFile: 'file:open',
  fileOpened: 'file:opened',
  saveFile: 'file:save',
  saveProject: 'project:save',
  listLibraries: 'tools:list',
  saveLibrary: 'tools:save',
  deleteLibrary: 'tools:delete',
  setDirty: 'file:set-dirty',
  menuCommand: 'menu:command',
  listRecent: 'recent:list',
  openRecent: 'recent:open',
  removeRecent: 'recent:remove',
  recentChanged: 'recent:changed',
  showStart: 'app:show-start',
  setLanguage: 'app:set-language',
  languageChanged: 'app:language-changed'
} as const
