import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const alias = { '@core': resolve('src/core'), '@i18n': resolve('src/i18n') }

/** The dev server needs an inline script (React refresh) and a websocket (hot reload); builds do not. */
const devCsp: Plugin = {
  name: 'dev-csp',
  apply: 'serve',
  transformIndexHtml: (html) =>
    html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace("connect-src 'self'", "connect-src 'self' ws: http://localhost:*")
}

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
    plugins: [react(), devCsp],
    resolve: { alias },
    build: { rollupOptions: { input: resolve('src/renderer/index.html') } }
  }
})
