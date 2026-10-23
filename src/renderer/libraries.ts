import { useCallback, useEffect, useState } from 'react'
import { loadToolLibrary, type ToolLibrary } from '@core/index'

// The user's tool libraries. Desktop: JSON files in the user data folder; browser: localStorage.
const KEY = 'cncsim.toolLibraries'

function readBrowser(): Record<string, string> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return v && typeof v === 'object' ? (v as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function writeBrowser(all: Record<string, string>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // storage full or blocked
  }
}

async function readAll(): Promise<string[]> {
  return window.api ? window.api.listLibraries() : Object.values(readBrowser())
}

/** Files that no longer match the schema are skipped rather than breaking the list. */
const parseAll = (texts: string[]) =>
  texts.flatMap((text) => {
    const r = loadToolLibrary(text)
    return r.ok ? [r.value] : []
  })

export function useLibraries() {
  const [user, setUser] = useState<ToolLibrary[]>([])

  const refresh = useCallback(async () => setUser(parseAll(await readAll())), [])
  useEffect(() => {
    void readAll().then((texts) => setUser(parseAll(texts)))
  }, [])

  const save = useCallback(
    async (lib: ToolLibrary) => {
      const json = `${JSON.stringify(lib, null, 2)}\n`
      if (window.api) await window.api.saveLibrary(lib.id, json)
      else writeBrowser({ ...readBrowser(), [lib.id]: json })
      await refresh()
    },
    [refresh]
  )

  const remove = useCallback(
    async (id: string) => {
      if (window.api) await window.api.deleteLibrary(id)
      else {
        const { [id]: _removed, ...rest } = readBrowser()
        writeBrowser(rest)
      }
      await refresh()
    },
    [refresh]
  )

  return { user, save, remove }
}
