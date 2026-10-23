import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { app } from 'electron'
import type { RecentItem } from '../preload/api'

// Recently opened files, newest first, kept in the user data folder (survives updates).
const MAX = 12
const storePath = () => join(app.getPath('userData'), 'recent.json')

let items: RecentItem[] = []

export async function loadRecent(): Promise<void> {
  try {
    const data: unknown = JSON.parse(await readFile(storePath(), 'utf8'))
    if (Array.isArray(data)) items = data.filter((d): d is RecentItem => typeof d === 'object' && d !== null && typeof (d as RecentItem).path === 'string')
  } catch {
    items = [] // first run or unreadable file
  }
}

const save = () => writeFile(storePath(), JSON.stringify(items, null, 2)).catch(() => undefined)

/** The list with `missing` set for files that were moved or deleted since. */
export function listRecent(): RecentItem[] {
  return items.map((i) => ({ ...i, missing: !existsSync(i.path) }))
}

export function addRecent(path: string): void {
  const kind: RecentItem['kind'] = extname(path).toLowerCase() === '.cncsim' ? 'project' : 'program'
  items = [{ path, name: basename(path), kind, openedAt: Date.now() }, ...items.filter((i) => i.path !== path)].slice(0, MAX)
  app.addRecentDocument(path)
  void save()
}

export function removeRecent(path: string): void {
  items = items.filter((i) => i.path !== path)
  void save()
}
