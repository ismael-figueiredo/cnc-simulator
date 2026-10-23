// Records docs/demo.gif for the README: start screen, then the bundled example running at 100×.
// Run with `npm run demo` (builds first). Needs Electron and gifenc, no ffmpeg.
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { app, BrowserWindow } from 'electron'
import gifenc from 'gifenc'

const { GIFEncoder, quantize, applyPalette } = gifenc
const root = resolve(import.meta.dirname, '..')
const OUT = resolve(root, 'docs/demo.gif')
const SIZE = { width: 1400, height: 860 }
const GIF_WIDTH = 960
const FPS = 10

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

async function record(win, seconds, frames) {
  const until = Date.now() + seconds * 1000
  while (Date.now() < until) {
    const t0 = Date.now()
    const image = (await win.webContents.capturePage()).resize({ width: GIF_WIDTH, quality: 'good' })
    frames.push({ image, at: t0 })
    await sleep(Math.max(0, 1000 / FPS - (Date.now() - t0)))
  }
}

void app.whenReady().then(async () => {
  const win = new BrowserWindow({ ...SIZE, show: false, useContentSize: true, webPreferences: { offscreen: true } })
  // Browser mode (no preload): same UI, and the user's recent files never show up in the recording
  await win.loadFile(resolve(root, 'out/renderer/index.html'))
  await win.webContents.executeJavaScript(`localStorage.clear()`)
  await win.webContents.reload()
  await sleep(2000)

  const js = (code) => win.webContents.executeJavaScript(code)
  const frames = []
  await record(win, 1.5, frames)
  await js(`document.querySelector('.recent-item').click()`)
  await sleep(1200)
  await js(`{
    const s = document.getElementById('player-speed')
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, '100')
    s.dispatchEvent(new Event('change', { bubbles: true }))
  }`)
  await sleep(300)
  await js(`document.querySelector('.player .play').click()`)
  await record(win, 9.6, frames)
  await record(win, 1.5, frames) // hold the finished part

  if (process.env['DEMO_FRAME']) writeFileSync(process.env['DEMO_FRAME'], frames[Math.floor(frames.length * 0.6)].image.toPNG())

  const gif = GIFEncoder()
  for (const [k, { image, at }] of frames.entries()) {
    // Capturing is slower than FPS on most machines: each frame lasts as long as it really took
    const delay = Math.round(((frames[k + 1]?.at ?? at + 1000 / FPS) - at) / 10) * 10
    const { width, height } = image.getSize()
    // nativeImage bitmaps are BGRA; gifenc wants RGBA
    const px = image.toBitmap()
    for (let i = 0; i < px.length; i += 4) [px[i], px[i + 2]] = [px[i + 2], px[i]]
    const palette = quantize(px, 256)
    gif.writeFrame(applyPalette(px, palette), width, height, { palette, delay })
  }
  gif.finish()
  mkdirSync(resolve(root, 'docs'), { recursive: true })
  writeFileSync(OUT, gif.bytes())
  process.stdout.write(`docs/demo.gif: ${frames.length} frames, ${(gif.bytes().length / 1e6).toFixed(1)} MB\n`)
  app.exit(0)
}).catch((e) => {
  console.error(e)
  app.exit(1)
})
