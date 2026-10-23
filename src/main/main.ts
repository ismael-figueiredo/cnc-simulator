import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { DEFAULT_LANGUAGE, LANGUAGES, isLanguage, translate, type Language, type MessageKey, type Params } from '../i18n'
import { CHANNELS, type OpenedFile } from '../preload/api'
import appIcon from '../../build/icon.png?asset'
import { addRecent, listRecent, loadRecent, removeRecent } from './recent'
import { ISSUES_URL, reportProblem } from './report'
import { checkForUpdates, setupUpdates } from './updater'

const PROGRAM_EXTENSIONS = ['nc', 'tap', 'ngc', 'cnc', 'min', 'txt', 'iso', 'mpf', 'eia', 'ptp']
const isMac = process.platform === 'darwin'

// The renderer owns the language choice and reports it on start and on every change.
let language: Language = DEFAULT_LANGUAGE

const t = (key: MessageKey, params?: Params) => translate(language, key, params)

// Built-in role menus (fileMenu, viewMenu…) always show Electron's English labels,
// so every item is listed here with a role for the behavior and a translated label.
function buildMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: t('menu.file'),
      submenu: [
        {
          label: t('menu.openProgram'),
          accelerator: 'CmdOrCtrl+O',
          click: (_item, win) => void openProgramFromMenu(win instanceof BrowserWindow ? win : undefined)
        },
        {
          label: t('menu.openRecent'),
          submenu: recentMenu()
        },
        {
          label: t('menu.home'),
          accelerator: 'CmdOrCtrl+Shift+H',
          click: (_item, win) => {
            if (win instanceof BrowserWindow) win.webContents.send(CHANNELS.showStart)
          }
        },
        { type: 'separator' },
        isMac ? { role: 'close', label: t('menu.closeWindow') } : { role: 'quit', label: t('menu.quit') }
      ]
    },
    {
      label: t('menu.view'),
      submenu: [
        { role: 'reload', label: t('menu.reload') },
        { role: 'forceReload', label: t('menu.forceReload') },
        { role: 'toggleDevTools', label: t('menu.toggleDevTools') },
        { type: 'separator' },
        { role: 'resetZoom', label: t('menu.resetZoom') },
        { role: 'zoomIn', label: t('menu.zoomIn') },
        { role: 'zoomOut', label: t('menu.zoomOut') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: t('menu.toggleFullscreen') }
      ]
    },
    {
      label: t('menu.window'),
      submenu: [
        { role: 'minimize', label: t('menu.minimize') },
        ...(isMac ? [{ role: 'zoom' as const, label: t('menu.zoom') }] : []),
        { role: 'close', label: t('menu.closeWindow') }
      ]
    },
    {
      label: t('menu.settings'),
      submenu: [
        {
          label: t('menu.language'),
          // Each language is listed in its own name, so it can be found from any UI language.
          submenu: LANGUAGES.map((l) => ({
            label: l.label,
            type: 'radio' as const,
            checked: l.code === language,
            click: () => applyLanguage(l.code)
          }))
        }
      ]
    },
    {
      role: 'help',
      label: t('menu.help'),
      submenu: [
        {
          label: t('menu.reportProblem'),
          click: (_item, win) => void reportProblem(win instanceof BrowserWindow ? win : undefined, t)
        },
        { label: t('menu.knownIssues'), click: () => void shell.openExternal(ISSUES_URL) },
        { type: 'separator' },
        { label: t('menu.checkUpdates'), click: () => void checkForUpdates(true) }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function recentMenu(): MenuItemConstructorOptions[] {
  const items = listRecent()
  if (!items.length) return [{ label: t('menu.noRecent'), enabled: false }]
  return [
    ...items.map((i) => ({
      label: i.name,
      sublabel: i.path,
      enabled: !i.missing,
      click: (_item: Electron.MenuItem, win: Electron.BaseWindow | undefined) => {
        void readProgram(i.path).then((file) => {
          if (file && win instanceof BrowserWindow) win.webContents.send(CHANNELS.fileOpened, file)
        })
      }
    })),
    { type: 'separator' },
    { label: t('menu.clearRecent'), click: () => clearRecent() }
  ]
}

/** Recent list changed: rebuild the menu and refresh the start screen. */
function recentChanged(): void {
  buildMenu()
  const items = listRecent()
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(CHANNELS.recentChanged, items)
}

function clearRecent(): void {
  for (const i of listRecent()) removeRecent(i.path)
  app.clearRecentDocuments()
  recentChanged()
}

/** Reads a program from disk and records it as recent; null if it is gone. */
async function readProgram(path: string): Promise<OpenedFile | null> {
  if (!existsSync(path)) {
    recentChanged()
    return null
  }
  // CNC programs are usually ASCII; latin1 keeps accents in old comments.
  const text = await readFile(path, 'latin1')
  addRecent(path)
  recentChanged()
  return { name: basename(path), path, text }
}

/** Language picked in the native menu: rebuild the menu and tell every window. */
function applyLanguage(lang: Language): void {
  if (lang === language) return
  language = lang
  buildMenu()
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send(CHANNELS.languageChanged, lang)
}

async function chooseProgram(win: BrowserWindow | undefined): Promise<OpenedFile | null> {
  const opts = {
    title: t('dialog.openProgram'),
    properties: ['openFile'] as Array<'openFile'>,
    filters: [
      { name: t('dialog.filterCnc'), extensions: PROGRAM_EXTENSIONS },
      { name: t('dialog.filterAll'), extensions: ['*'] }
    ]
  }
  const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  const path = r.filePaths[0]
  if (r.canceled || !path) return null
  return readProgram(path)
}

async function openProgramFromMenu(win: BrowserWindow | undefined): Promise<void> {
  const target = win ?? BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const file = await chooseProgram(target)
  if (file && target) target.webContents.send(CHANNELS.fileOpened, file)
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    title: t('app.name'),
    backgroundColor: '#101417',
    // Packaged builds take the icon from the installer; this covers dev mode and the Linux window
    icon: appIcon,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      sandbox: false
    }
  })
  win.once('ready-to-show', () => win.show())

  // electron-vite sets ELECTRON_RENDERER_URL in dev mode (Vite server with hot reload).
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

ipcMain.handle(CHANNELS.setLanguage, (_e, lang: unknown) => {
  if (!isLanguage(lang) || lang === language) return
  language = lang
  buildMenu()
})

ipcMain.handle(CHANNELS.openFile, (e) => chooseProgram(BrowserWindow.fromWebContents(e.sender) ?? undefined))
ipcMain.handle(CHANNELS.listRecent, () => listRecent())
ipcMain.handle(CHANNELS.openRecent, (_e, path: unknown) => (typeof path === 'string' ? readProgram(path) : null))
ipcMain.handle(CHANNELS.removeRecent, (_e, path: unknown) => {
  if (typeof path === 'string') removeRecent(path)
  recentChanged()
  return listRecent()
})

void app.whenReady().then(async () => {
  await loadRecent()
  buildMenu()
  if (isMac) app.dock?.setIcon(appIcon)
  createWindow()
  setupUpdates(t)
  void checkForUpdates(false)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})
