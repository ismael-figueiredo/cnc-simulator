import { useCallback, useEffect, useState } from 'react'
import type { OpenedFile, RecentItem } from '../preload/api'

// Desktop: the main process keeps the list and reads the files again from disk.
// Browser (server mode): there are no paths, so the text itself is kept in localStorage.
const KEY = 'cncsim.recent'
const MAX_BROWSER = 8
/** Larger programs are listed without their text and must be picked again. */
const MAX_TEXT = 300_000

interface BrowserEntry extends RecentItem {
  text?: string
}

function readBrowser(): BrowserEntry[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(v) ? (v as BrowserEntry[]) : []
  } catch {
    return []
  }
}

function writeBrowser(entries: BrowserEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries))
  } catch {
    // storage full or blocked: the list is just not kept
  }
}

const toItems = (entries: BrowserEntry[]): RecentItem[] => entries.map(({ text, ...item }) => ({ ...item, missing: text === undefined }))

export function useRecent() {
  const [items, setItems] = useState<RecentItem[]>(() => (window.api ? [] : toItems(readBrowser())))

  useEffect(() => {
    if (!window.api) return
    void window.api.listRecent().then(setItems)
    return window.api.onRecentChanged(setItems)
  }, [])

  const open = useCallback(async (item: RecentItem): Promise<OpenedFile | null> => {
    if (window.api) return window.api.openRecent(item.path)
    const entry = readBrowser().find((e) => e.path === item.path)
    return entry?.text === undefined ? null : { name: entry.name, path: entry.path, text: entry.text }
  }, [])

  const remove = useCallback(async (item: RecentItem) => {
    if (window.api) {
      setItems(await window.api.removeRecent(item.path))
      return
    }
    const entries = readBrowser().filter((e) => e.path !== item.path)
    writeBrowser(entries)
    setItems(toItems(entries))
  }, [])

  /** Browser only: the desktop records files in the main process when it reads them. */
  const record = useCallback((file: OpenedFile) => {
    if (window.api) return
    const entry: BrowserEntry = {
      path: file.path,
      name: file.name,
      kind: 'program',
      openedAt: Date.now(),
      ...(file.text.length <= MAX_TEXT ? { text: file.text } : {})
    }
    const entries = [entry, ...readBrowser().filter((e) => e.path !== file.path)].slice(0, MAX_BROWSER)
    writeBrowser(entries)
    setItems(toItems(entries))
  }, [])

  return { items, open, remove, record }
}
