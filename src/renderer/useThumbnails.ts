import { useEffect, useState } from 'react'
import { radialTools, type SimulationInput, type Stock, type Vec3 } from '@core/index'
import { createSimulator } from './simulation'
import { readThumb, renderPart, writeThumb } from './thumbnail'

/** A part to draw: the program to simulate and the stock it is cut from. */
export interface ThumbJob {
  key: string
  input: SimulationInput
  stock: Stock
  zero: Vec3
  lathe: boolean
}

/**
 * Pictures of finished parts, drawn one after the other in the background (simulated in a worker,
 * machined and rendered off screen) and kept in storage, so the next start shows them at once.
 */
export function usePartThumbnails(jobs: readonly ThumbJob[]): Record<string, string> {
  const [thumbs, setThumbs] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {}
    for (const j of jobs) {
      const url = readThumb(j.key)
      if (url) out[j.key] = url
    }
    return out
  })
  useEffect(() => {
    // An object, so the loop sees the cleanup's change after each await
    const run = { stopped: false }
    const stopped = () => run.stopped
    const simulator = createSimulator()
    void (async () => {
      for (const job of jobs) {
        if (stopped()) return
        const cached = readThumb(job.key)
        if (cached) {
          setThumbs((t) => (t[job.key] === cached ? t : { ...t, [job.key]: cached }))
          continue
        }
        const result = await simulator.run(job.input)
        if (stopped()) return
        // Let the screen paint between parts
        await new Promise((done) => setTimeout(done, 30))
        const ballTools = new Set(job.input.tools?.tools.filter((x) => x.type === 'ball-endmill').map((x) => x.number) ?? [])
        const radial = job.lathe ? radialTools(job.input.tools ?? null) : undefined
        const url = renderPart({ moves: result.moves, stock: job.stock, zero: job.zero, lathe: job.lathe, ballTools, radialTools: radial })
        if (!url) continue
        writeThumb(job.key, url)
        setThumbs((t) => ({ ...t, [job.key]: url }))
      }
    })()
    return () => {
      run.stopped = true
      simulator.dispose()
    }
  }, [jobs])
  return thumbs
}
