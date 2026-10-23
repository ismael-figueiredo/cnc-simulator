import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { release } from 'node:os'
import { app, clipboard, ClipboardItem, dialog, shell, type BrowserWindow } from 'electron'
import type { MessageKey, Params } from '../i18n'

export const REPO_URL = 'https://github.com/ismael-figueiredo/cnc-simulator'
export const ISSUES_URL = `${REPO_URL}/issues`

type Translate = (key: MessageKey, params?: Params) => string

const OS_NAMES: Partial<Record<NodeJS.Platform, string>> = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }

/** New issue from .github/ISSUE_TEMPLATE/bug.yml, with the fields the app knows already filled in. */
function newIssueUrl(): string {
  const os = `${OS_NAMES[process.platform] ?? process.platform} ${release()} (${process.arch})`
  const query = new URLSearchParams({ template: 'bug.yml', version: app.getVersion(), os })
  return `${ISSUES_URL}/new?${query.toString()}`
}

/** Saves a screenshot of the window to Downloads and copies it, so it can be pasted into the issue. */
async function captureWindow(win: BrowserWindow): Promise<string> {
  const image = await win.webContents.capturePage()
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const path = join(app.getPath('downloads'), `cnc-simulator-${stamp}.png`)
  const png = image.toPNG()
  await writeFile(path, png)
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })])
  return path
}

/** Help > Report a problem: explains how to post, then opens a prefilled GitHub issue. */
export async function reportProblem(win: BrowserWindow | undefined, t: Translate): Promise<void> {
  const opts = {
    type: 'info' as const,
    title: t('report.title'),
    message: t('report.message'),
    detail: t('report.detail'),
    checkboxLabel: t('report.screenshot'),
    checkboxChecked: win !== undefined,
    buttons: [t('report.open'), t('common.cancel')],
    defaultId: 0,
    cancelId: 1
  }
  const r = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
  if (r.response !== 0) return
  if (win && r.checkboxChecked) shell.showItemInFolder(await captureWindow(win))
  await shell.openExternal(newIssueUrl())
}
