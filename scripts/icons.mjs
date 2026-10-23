// Renders build/icon.svg and the installer artwork. Run with `npm run icons` (needs Electron, no other tools).
// electron-builder turns build/icon.png into the .icns (macOS) and .ico (Windows) files by itself.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { app, BrowserWindow } from 'electron'

const root = resolve(import.meta.dirname, '..')
const svg = readFileSync(resolve(root, 'build/icon.svg'), 'utf8')
const logo = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

const FONT = `font-family:-apple-system,'Segoe UI',Roboto,sans-serif`
const DARK = 'background:linear-gradient(#1f2a37,#0b1117)'
const GRID = (color) =>
  `background-image:linear-gradient(${color} 1px,transparent 1px),linear-gradient(90deg,${color} 1px,transparent 1px);background-size:20px 20px`

const page = (body, style = '') => `<html><head><meta charset="utf-8"></head><body style="margin:0;overflow:hidden;${FONT};${style}">${body}</body></html>`

const iconPage = (size) => page(`<img src="${logo}" width="${size}" height="${size}">`, 'background:transparent')

// Windows installer, welcome and finish pages: 164x314 strip on the left
const sidebar = page(
  `<div style="position:absolute;inset:0;${GRID('rgba(34,211,238,.06)')}"></div>
   <div style="position:relative;text-align:center;padding-top:44px;color:#e6edf3">
     <img src="${logo}" width="112" height="112">
     <div style="font-size:19px;font-weight:700;margin-top:10px">CNC Simulator</div>
     <div style="font-size:11px;color:#22d3ee;margin-top:6px;letter-spacing:.5px">G-code · 3D</div>
   </div>
   <svg style="position:absolute;left:0;bottom:30px" width="164" height="60" viewBox="0 0 164 60">
     <path d="M14 20H52Q60 20 64 28L70 40H100" fill="none" stroke="#22d3ee" stroke-width="4" stroke-linecap="round"/>
     <path d="M100 40H118L124 28Q128 20 136 20H150" fill="none" stroke="#22d3ee" stroke-opacity=".45" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 7"/>
     <circle cx="100" cy="40" r="5" fill="#ffb547"/>
   </svg>`,
  DARK
)

// Windows installer, inner pages: 150x57 on the right of the white header band
const header = page(
  `<div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;height:57px;padding-right:6px;color:#1f2a37">
     <div style="font-size:13px;font-weight:700;line-height:1.1;text-align:right">CNC<br>Simulator</div>
     <img src="${logo}" width="48" height="48">
   </div>`,
  'background:#ffffff'
)

// macOS disk image window: app icon on the left, Applications link on the right (positions in electron-builder.yml)
const dmg = page(
  `<div style="position:absolute;inset:0;${GRID('rgba(31,42,55,.05)')}"></div>
   <div style="position:relative;display:flex;align-items:center;justify-content:center;gap:10px;padding-top:26px;color:#1f2a37">
     <img src="${logo}" width="40" height="40">
     <div style="font-size:22px;font-weight:700">CNC Simulator</div>
   </div>
   <svg style="position:absolute;left:0;top:0" width="540" height="380" viewBox="0 0 540 380">
     <path d="M214 190H312" fill="none" stroke="#0891b2" stroke-width="5" stroke-linecap="round" stroke-dasharray="2 12"/>
     <path d="M310 176L330 190L310 204" fill="none" stroke="#0891b2" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
   </svg>
   <div style="position:absolute;left:0;right:0;bottom:34px;text-align:center;color:#52606d;font-size:13px;line-height:1.5">
     Arraste para <b>Aplicativos</b> para instalar<br>
     <span style="font-size:11px;color:#7b8794">Drag to Applications to install · Arrastre a Aplicaciones para instalar</span>
   </div>`,
  'background:linear-gradient(#f7f9fb,#e3e9ef)'
)

const outputs = [
  { file: 'build/icon.png', html: iconPage(1024), width: 1024, height: 1024 }, // installers, dock, taskbar, Linux window
  { file: 'src/renderer/public/favicon.png', html: iconPage(64), width: 64, height: 64 }, // browser tab and server mode
  { file: 'build/installerSidebar.bmp', html: sidebar, width: 164, height: 314 },
  { file: 'build/uninstallerSidebar.bmp', html: sidebar, width: 164, height: 314 },
  { file: 'build/installerHeader.bmp', html: header, width: 150, height: 57 },
  { file: 'build/background.png', html: dmg, width: 540, height: 380 },
  { file: 'build/background@2x.png', html: dmg, width: 540, height: 380, scale: 2 }
]

async function render({ html, width, height, scale = 1 }) {
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    frame: false,
    transparent: true,
    useContentSize: true,
    webPreferences: { offscreen: true, zoomFactor: 1 }
  })
  // The page is laid out at 1x and zoomed, so @2x images keep the same composition
  const zoomed = scale === 1 ? html : html.replace('<body style="', `<body style="zoom:${scale};`)
  win.setContentSize(width * scale, height * scale)
  await win.loadURL(`data:text/html;base64,${Buffer.from(zoomed).toString('base64')}`)
  // Offscreen pages can finish loading before the first frame is painted
  await new Promise((done) => setTimeout(done, 300))
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: width * scale, height: height * scale })
  win.destroy()
  return image.resize({ width: width * scale, height: height * scale, quality: 'best' })
}

/** NSIS only reads 24-bit BMP files. nativeImage gives BGRA rows top-down; BMP stores BGR rows bottom-up, 4-byte aligned. */
function toBmp(image) {
  const { width, height } = image.getSize()
  const bgra = image.toBitmap()
  const rowSize = Math.ceil((width * 3) / 4) * 4
  const out = Buffer.alloc(54 + rowSize * height)
  out.write('BM', 0)
  out.writeUInt32LE(out.length, 2)
  out.writeUInt32LE(54, 10)
  out.writeUInt32LE(40, 14)
  out.writeInt32LE(width, 18)
  out.writeInt32LE(height, 22)
  out.writeUInt16LE(1, 26)
  out.writeUInt16LE(24, 28)
  out.writeUInt32LE(rowSize * height, 34)
  for (let y = 0; y < height; y++) {
    const dst = 54 + (height - 1 - y) * rowSize
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4
      out[dst + x * 3] = bgra[src]
      out[dst + x * 3 + 1] = bgra[src + 1]
      out[dst + x * 3 + 2] = bgra[src + 2]
    }
  }
  return out
}

app.disableHardwareAcceleration()
// Each render opens and closes its own window; without this Electron quits after the first one
app.on('window-all-closed', () => undefined)
void app.whenReady().then(async () => {
  for (const output of outputs) {
    const path = resolve(root, output.file)
    const image = await render(output)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, path.endsWith('.bmp') ? toBmp(image) : image.toPNG())
    const { width, height } = image.getSize()
    process.stdout.write(`${output.file} (${width}x${height})\n`)
  }
  app.quit()
}).catch((e) => {
  console.error(e)
  app.exit(1)
})
