import { app, dialog, shell, BrowserWindow, type MessageBoxOptions } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { MessageKey, Params } from '../i18n'
import { REPO_URL } from './report'

type Translate = (key: MessageKey, params?: Params) => string

// The Windows installer and the AppImage update themselves from the GitHub release files (latest*.yml).
// macOS only installs updates for signed apps and the .deb belongs to the system package manager,
// so those builds look up the latest release and offer the download page instead.
const canSelfUpdate = process.platform === 'win32' || (process.platform === 'linux' && process.env['APPIMAGE'] !== undefined)

let t: Translate
let manualCheck = false

function show(opts: MessageBoxOptions) {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  return win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts)
}

/** "1.2.10" > "1.2.9"; ignores a leading "v". */
function isNewer(latest: string, current: string): boolean {
  const parts = (v: string) => v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const [a, b] = [parts(latest), parts(current)]
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0)
    if (d !== 0) return d > 0
  }
  return false
}

async function offerDownload(version: string): Promise<void> {
  const r = await show({
    type: 'info',
    title: t('update.title'),
    message: t('update.available', { version }),
    detail: t('update.availableDetail'),
    buttons: [t('update.download'), t('common.later')],
    defaultId: 0,
    cancelId: 1
  })
  if (r.response === 0) await shell.openExternal(`${REPO_URL}/releases/latest`)
}

async function checkLatestRelease(): Promise<void> {
  const res = await fetch(`${REPO_URL.replace('github.com', 'api.github.com/repos')}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json' }
  })
  if (!res.ok) throw new Error(`GitHub ${res.status}`)
  const { tag_name: tag } = (await res.json()) as { tag_name: string }
  if (isNewer(tag, app.getVersion())) await offerDownload(tag.replace(/^v/, ''))
  else if (manualCheck) await show({ type: 'info', title: t('update.title'), message: t('update.latest', { version: app.getVersion() }) })
}

async function reportFailure(e: unknown): Promise<void> {
  // Checks on start stay silent: being offline is normal on the shop floor.
  if (!manualCheck) return
  await show({ type: 'warning', title: t('update.title'), message: t('update.failed'), detail: String(e) })
}

export function setupUpdates(translate: Translate): void {
  t = translate
  if (!canSelfUpdate) return
  autoUpdater.logger = null
  autoUpdater.on('error', (e) => void reportFailure(e))
  autoUpdater.on('update-not-available', () => {
    if (manualCheck) void show({ type: 'info', title: t('update.title'), message: t('update.latest', { version: app.getVersion() }) })
  })
  autoUpdater.on('update-downloaded', ({ version }) => {
    void show({
      type: 'info',
      title: t('update.title'),
      message: t('update.ready', { version }),
      detail: t('update.readyDetail'),
      buttons: [t('update.restart'), t('common.later')],
      defaultId: 0,
      cancelId: 1
    }).then((r) => {
      if (r.response === 0) autoUpdater.quitAndInstall()
    })
  })
}

/** Runs on start (silent) and from Help > Check for updates (manual: always answers). */
export async function checkForUpdates(manual: boolean): Promise<void> {
  manualCheck = manual
  if (!app.isPackaged) {
    if (manual) await show({ type: 'info', title: t('update.title'), message: t('update.devOnly') })
    return
  }
  if (canSelfUpdate) {
    // Failures here and in the background download both arrive through the 'error' event
    await autoUpdater.checkForUpdates().catch(() => undefined)
    return
  }
  await checkLatestRelease().catch(reportFailure)
}
