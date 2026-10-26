/** Small text values kept between sessions. Never throws: blocked or full storage just keeps nothing. */
export interface KeyValueStore {
  get: (key: string) => string | null
  set: (key: string, value: string) => void
}

/** A store over the browser's storage, or over any object with the same two methods (tests). */
export function createStore(backing: () => Pick<Storage, 'getItem' | 'setItem'>): KeyValueStore {
  return {
    get(key) {
      try {
        return backing().getItem(key)
      } catch {
        return null
      }
    },
    set(key, value) {
      try {
        backing().setItem(key, value)
      } catch {
        // storage full or blocked: the value is just not kept
      }
    }
  }
}

/** A JSON value, or the fallback when it is missing, unreadable or of the wrong shape. */
export function readJson<T>(store: KeyValueStore, key: string, fallback: T, valid: (v: unknown) => v is T): T {
  try {
    const v: unknown = JSON.parse(store.get(key) ?? 'null')
    return valid(v) ? v : fallback
  } catch {
    return fallback
  }
}

export const writeJson = (store: KeyValueStore, key: string, value: unknown) => store.set(key, JSON.stringify(value))

export const readFlag = (store: KeyValueStore, key: string, fallback: boolean) => {
  const v = store.get(key)
  return v === null ? fallback : v === '1'
}

export const writeFlag = (store: KeyValueStore, key: string, on: boolean) => store.set(key, on ? '1' : '0')

/** A positive number, or the fallback. */
export const readNumber = (store: KeyValueStore, key: string, fallback: number) => {
  const v = Number(store.get(key))
  return Number.isFinite(v) && v > 0 ? v : fallback
}

/** The window's localStorage: preferences, the browser's recent files and tool libraries, part pictures. */
export const storage = createStore(() => localStorage)
