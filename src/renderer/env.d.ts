import type { CncApi } from '../preload/api'

declare global {

  interface Window {
    /** Only present in the Electron app; undefined in the browser (server mode). */
    api?: CncApi
  }
}

export {}
