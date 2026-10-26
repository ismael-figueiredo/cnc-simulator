import { describe, expect, it } from 'vitest'
import type { CncApi, OpenedFile, RecentItem } from '../src/preload/api'
import { browserPlatform, type BrowserDeps } from '../src/renderer/platform/browser'
import { electronPlatform } from '../src/renderer/platform/electron'
import { createStore, readFlag, readJson, readNumber } from '../src/renderer/platform/storage'

/** A store over a plain map, like localStorage. */
function memoryStore(failing = false) {
  const data = new Map<string, string>()
  const store = createStore(() => ({
    getItem: (k: string) => {
      if (failing) throw new Error('blocked')
      return data.get(k) ?? null
    },
    setItem: (k: string, v: string) => {
      if (failing) throw new Error('full')
      data.set(k, v)
    }
  }))
  return { data, store }
}

function browser(picked: { name: string; text: string } | null = null) {
  const { store, data } = memoryStore()
  const downloads: { name: string; text: string; type: string }[] = []
  const deps: BrowserDeps = { store, download: (name, text, type) => downloads.push({ name, text, type }), pickFile: () => Promise.resolve(picked), now: () => 1000 }
  return { platform: browserPlatform(deps), downloads, data }
}

const program: OpenedFile = { name: 'O1000.nc', path: 'O1000.nc', text: 'G0 X0;' }

describe('storage', () => {
  it('never throws when the storage is blocked or full', () => {
    const { store } = memoryStore(true)
    expect(store.get('x')).toBeNull()
    expect(() => store.set('x', '1')).not.toThrow()
  })

  it('reads typed values with a fallback for missing or malformed ones', () => {
    const { store } = memoryStore()
    const isList = (v: unknown): v is number[] => Array.isArray(v)
    expect(readJson(store, 'k', [7], isList)).toEqual([7])
    store.set('k', '{bad json')
    expect(readJson(store, 'k', [7], isList)).toEqual([7])
    store.set('k', '{"a":1}')
    expect(readJson(store, 'k', [7], isList)).toEqual([7])
    store.set('k', '[1,2]')
    expect(readJson(store, 'k', [7], isList)).toEqual([1, 2])

    expect(readFlag(store, 'f', true)).toBe(true)
    store.set('f', '0')
    expect(readFlag(store, 'f', true)).toBe(false)
    store.set('n', '-3')
    expect(readNumber(store, 'n', 11.5)).toBe(11.5)
    store.set('n', '14')
    expect(readNumber(store, 'n', 11.5)).toBe(14)
  })
})

describe('browser platform', () => {
  it('opens a picked program, or a picked project with its text', async () => {
    expect(await browser({ name: 'O1.nc', text: 'M30' }).platform.openFile()).toEqual({ name: 'O1.nc', path: 'O1.nc', text: 'M30' })
    expect(await browser({ name: 'Part.CNCSIM', text: '{}' }).platform.openFile()).toEqual({
      name: 'Part.CNCSIM',
      path: '',
      text: '',
      project: { path: 'Part.CNCSIM', text: '{}', programMissing: false }
    })
    expect(await browser(null).platform.openFile()).toBeNull()
  })

  it('downloads a saved program and lists it as recent', async () => {
    const { platform, downloads } = browser()
    const changes: RecentItem[][] = []
    platform.recent.onChange((items) => changes.push(items))
    expect(await platform.saveProgram(program, false)).toEqual(program)
    expect(downloads).toEqual([{ name: 'O1000.nc', text: 'G0 X0;', type: 'text/plain' }])
    const items = await platform.recent.list()
    expect(items).toEqual([{ path: 'O1000.nc', name: 'O1000.nc', kind: 'program', openedAt: 1000, missing: false }])
    expect(changes).toEqual([items])
    expect(await platform.recent.open(items[0] as RecentItem)).toEqual(program)
  })

  it('keeps the newest recent files, and large ones without their text', async () => {
    const { platform } = browser()
    for (let i = 0; i < 10; i++) platform.recent.record({ name: `O${i}.nc`, path: `O${i}.nc`, text: '' })
    platform.recent.record({ name: 'BIG.nc', path: 'BIG.nc', text: 'X'.repeat(300_001) })
    const items = await platform.recent.list()
    expect(items.map((i) => i.name)).toEqual(['BIG.nc', 'O9.nc', 'O8.nc', 'O7.nc', 'O6.nc', 'O5.nc', 'O4.nc', 'O3.nc'])
    expect(items[0]?.missing).toBe(true)
    expect(await platform.recent.open(items[0] as RecentItem)).toBeNull()
    await platform.recent.remove(items[1] as RecentItem)
    expect((await platform.recent.list()).map((i) => i.name)).not.toContain('O9.nc')
  })

  it('downloads a project with a copy of its program', async () => {
    const { platform, downloads } = browser()
    expect(await platform.saveProject({ project: { machine: 'romi-gl300' }, projectPath: null, program }, false)).toBe('O1000.cncsim')
    expect(await platform.saveProject({ project: {}, projectPath: 'Mine.cncsim', program }, false)).toBe('Mine.cncsim')
    expect(JSON.parse(downloads[0]?.text ?? '')).toEqual({ machine: 'romi-gl300', program: 'O1000.nc', programText: 'G0 X0;' })
    expect(platform.projectNeedsProgramFile).toBe(false)
  })

  it('keeps tool libraries in the store', async () => {
    const { platform } = browser()
    await platform.libraries.save('a', '{"id":"a"}')
    await platform.libraries.save('b', '{"id":"b"}')
    await platform.libraries.remove('a')
    expect(await platform.libraries.list()).toEqual(['{"id":"b"}'])
  })
})

describe('electron platform', () => {
  /** An API that records the calls it gets. */
  function fakeApi() {
    const calls: unknown[][] = []
    const call =
      (name: string, result: unknown = null) =>
      (...args: unknown[]) => {
        calls.push([name, ...args])
        return Promise.resolve(result)
      }
    const api = {
      platform: 'darwin',
      saveFile: call('saveFile', program),
      saveProject: call('saveProject', '/a/O1000.cncsim'),
      openRecent: call('openRecent'),
      setDirty: call('setDirty')
    } as unknown as CncApi
    return { api, calls }
  }

  it('asks where to save programs that have no file yet', async () => {
    const { api, calls } = fakeApi()
    const p = electronPlatform(api)
    await p.saveProgram({ ...program, path: '/a/O1000.nc' }, false)
    await p.saveProgram({ ...program, path: '' }, false)
    await p.saveProgram({ ...program, path: 'example:O1001.nc' }, false)
    expect(calls.map((c) => c[2])).toEqual([false, true, true])
  })

  it('sends the project with the program path, and no project path on save as', async () => {
    const { api, calls } = fakeApi()
    const p = electronPlatform(api)
    await p.saveProject({ project: {}, projectPath: '/a/P.cncsim', program: { ...program, path: '/a/O1000.nc' } }, false)
    await p.saveProject({ project: {}, projectPath: '/a/P.cncsim', program: { ...program, path: '/a/O1000.nc' } }, true)
    expect(calls).toEqual([
      ['saveProject', { project: {}, projectPath: '/a/P.cncsim', programPath: '/a/O1000.nc' }, false],
      ['saveProject', { project: {}, projectPath: '', programPath: '/a/O1000.nc' }, true]
    ])
    expect(p.desktop && p.projectNeedsProgramFile).toBe(true)
    expect(p.os).toBe('darwin')
  })
})
