// Screenshots of the app for the website (docs/img): the machine screen, the 3D model and the
// start screen with its part pictures. Run with `npm run screens` (builds first).
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { app, BrowserWindow } from 'electron'

const root = resolve(import.meta.dirname, '..')
const OUT = resolve(root, 'docs/img')
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

// One window per language: closing the first must not quit
app.on('window-all-closed', () => undefined)
void app.whenReady().then(async () => {
  mkdirSync(OUT, { recursive: true })
  for (const lang of ['pt-BR', 'en']) {
    const win = new BrowserWindow({ width: 1400, height: 860, show: false, useContentSize: true, webPreferences: { offscreen: true } })
    await win.loadFile(resolve(root, 'out/renderer/index.html'))
    await win.webContents.executeJavaScript(`localStorage.clear(); localStorage.setItem('cncsim.tourDone', '1'); localStorage.setItem('cncsim.language', '${lang}')`)
    await win.webContents.reload()
    await sleep(1500)
    const js = (code) => win.webContents.executeJavaScript(code)
    // JPEG at 1200 px wide: light enough for a fast page
    const shot = async (name) => {
      const image = (await win.webContents.capturePage()).resize({ width: 1200, quality: 'best' })
      const file = `${name}-${lang === 'en' ? 'en' : 'pt'}.jpg`
      writeFileSync(resolve(OUT, file), image.toJPEG(82))
      process.stdout.write(`docs/img/${file}\n`)
    }
    const open = async (name) => {
      await js(`document.querySelector('.tab-new')?.click()`)
      await sleep(300)
      await js(`document.querySelectorAll('.backstage-tabs button')[1].click()`)
      await sleep(300)
      await js(`[...document.querySelectorAll('.file-item')].find((b) => b.textContent.includes('${name}')).click()`)
      await sleep(2500)
    }
    await js(`document.querySelectorAll('.backstage-tabs button')[1].click()`)
    // The part pictures are drawn in the background
    await sleep(15000)
    await shot('start')
    await open('O2001')
    await js(`document.querySelector('.op-round.start').click()`)
    await sleep(6000)
    await js(`document.querySelector('.op-round.hold').click()`)
    await sleep(300)
    await shot('machine-mill')
    await open('O1002')
    await js(`[...document.querySelectorAll('.layout-switch button')][1].click()`)
    await sleep(800)
    // The finished part, from the view toolbar's display menu
    await js(`document.querySelectorAll('.workspace.active .vt-menu > button')[1].click()`)
    await sleep(200)
    await js(`document.querySelectorAll('.workspace.active .vt-menu .check input')[3].click()`)
    await sleep(1500)
    // The same button closes the menu
    await js(`document.querySelectorAll('.workspace.active .vt-menu > button')[1].click()`)
    await sleep(500)
    await shot('model-lathe')
    win.destroy()
  }
  app.exit(0)
}).catch((e) => {
  console.error(e)
  app.exit(1)
})
