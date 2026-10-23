import type { CncApi } from '../preload/api'

declare global {
  /** package.json version, set at build time (electron.vite.config.ts). */
  const __APP_VERSION__: string

  interface Window {
    /** Only present in the Electron app; undefined in the browser (server mode). */
    api?: CncApi
  }
}

export {}
