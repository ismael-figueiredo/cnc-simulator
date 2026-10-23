// Contract between the window (renderer) and the main process. Used by both sides.

export interface OpenedFile {
  name: string
  path: string
  text: string
}

export interface CncApi {
  /** Shows the system dialog and returns the chosen program, or null if cancelled. */
  openFile: () => Promise<OpenedFile | null>
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
  setLanguage: 'app:set-language',
  languageChanged: 'app:language-changed'
} as const
