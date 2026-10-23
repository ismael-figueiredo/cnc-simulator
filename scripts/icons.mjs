// Renders build/icon.svg to the PNGs the app uses. Run with `npm run icons` (needs Electron, no other tools).
// electron-builder turns build/icon.png into the .icns (macOS) and .ico (Windows) files by itself.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { app, BrowserWindow } from 'electron'

const root = resolve(import.meta.dirname, '..')
const svg = readFileSync(resolve(root, 'build/icon.svg'), 'utf8')

const outputs = [
  { file: 'build/icon.png', size: 1024 }, // installers, dock, taskbar, Linux window
  { file: 'src/renderer/public/favicon.png', size: 64 } // browser tab and server mode
]

async function render(size) {
  const win = new BrowserWindow({
    width: size,
    height: size,
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    webPreferences: { offscreen: true, zoomFactor: 1 }
  })
  const html = `<html><body style="margin:0;background:transparent">
    <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}">
  </body></html>`
  await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`)
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })
  win.destroy()
  return image.resize({ width: size, height: size, quality: 'best' }).toPNG()
}

app.disableHardwareAcceleration()
// Each render opens and closes its own window; without this Electron quits after the first one
app.on('window-all-closed', () => undefined)
void app.whenReady().then(async () => {
  for (const { file, size } of outputs) {
    const path = resolve(root, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, await render(size))
    process.stdout.write(`${file} (${size}x${size})\n`)
  }
  app.quit()
})
