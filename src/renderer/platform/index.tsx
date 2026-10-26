import { createContext, useContext, type ReactNode } from 'react'
import { browserPlatform } from './browser'
import { download, pickFile } from './dom'
import { electronPlatform } from './electron'
import { storage } from './storage'
import type { Platform } from './types'

export type { Platform, SaveProjectInput } from './types'
export { readFlag, readJson, readNumber, storage, writeFlag, writeJson } from './storage'

/** The desktop app when the preload exposed its API, else the browser (server mode). */
export function detectPlatform(): Platform {
  return window.api ? electronPlatform(window.api) : browserPlatform({ store: storage, download, pickFile })
}

const PlatformContext = createContext<Platform | null>(null)

export function PlatformProvider({ platform, children }: { platform: Platform; children: ReactNode }) {
  return <PlatformContext.Provider value={platform}>{children}</PlatformContext.Provider>
}

export function usePlatform(): Platform {
  const ctx = useContext(PlatformContext)
  if (!ctx) throw new Error('usePlatform must be used inside <PlatformProvider>')
  return ctx
}
