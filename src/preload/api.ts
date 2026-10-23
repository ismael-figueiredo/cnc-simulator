// Contract between the window (renderer) and the main process. Used by both sides.

export interface OpenedFile {
  name: string
  path: string
  text: string
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

/** File menu items handled by the window (it owns the program text). */
export type MenuCommand = 'new' | 'save' | 'saveAs'

export interface CncApi {
  /** Shows the system dialog and returns the chosen program, or null if cancelled. */
  openFile: () => Promise<OpenedFile | null>
  /**
   * Writes the program. Without a usable path, or with saveAs, shows the save dialog first.
   * Returns the saved file (new name and path), or null if cancelled.
   */
  saveFile: (file: OpenedFile, saveAs: boolean) => Promise<OpenedFile | null>
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
