import { useCallback, useState } from 'react'
import { readJson, storage, writeJson } from './platform'

/** What the 3D view draws. */
export interface DisplayOptions {
  rapids: boolean
  stock: boolean
  /** What holds the part: the chuck (lathes) or the table (machining centers). */
  holding: boolean
  vise: boolean
  tailstock: boolean
  machining: boolean
  /** Lathe only: chuck and part turn in C while the tool stays in X/Z. */
  machineView: boolean
  /** The stock as the whole program leaves it, wherever playback is. */
  finished: boolean
}

const KEY = 'cncsim.display'
const DEFAULTS: DisplayOptions = { rapids: true, stock: true, holding: true, vise: true, tailstock: true, machining: true, machineView: true, finished: false }
const isOptions = (v: unknown): v is Partial<DisplayOptions> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** The 3D view's display options, kept for the next documents (except "finished", which is about playback). */
export function useDisplayOptions() {
  const [display, setDisplay] = useState<DisplayOptions>(() => ({ ...DEFAULTS, ...readJson(storage, KEY, {}, isOptions), finished: false }))
  const changeDisplay = useCallback((change: Partial<DisplayOptions>) => {
    setDisplay((d) => {
      const next = { ...d, ...change }
      const { finished: _finished, ...kept } = next
      writeJson(storage, KEY, kept)
      return next
    })
  }, [])
  return { display, changeDisplay }
}
