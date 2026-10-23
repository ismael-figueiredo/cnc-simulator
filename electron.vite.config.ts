import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const alias = { '@core': resolve('src/core'), '@i18n': resolve('src/i18n') }
// The UI shows the version from package.json (the one installers and updates use)
const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

export default defineConfig({
  main: {
    resolve: { alias },
    build: { externalizeDeps: true, rollupOptions: { input: resolve('src/main/main.ts') } }
  },
  preload: {
    build: { externalizeDeps: true, rollupOptions: { input: resolve('src/preload/preload.ts') } }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    resolve: { alias },
    define: { __APP_VERSION__: JSON.stringify(version) },
    build: { rollupOptions: { input: resolve('src/renderer/index.html') } }
  }
})
