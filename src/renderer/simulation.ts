import { simulate, type SimulationInput, type SimulationResult } from '@core/index'
import type { SimRequest, SimResponse } from './simulation.worker'
// Inlined as a blob URL, so it loads the same from file:// (desktop) and http:// (browser mode)
import SimWorker from './simulation.worker?worker&inline'

/**
 * Simulations in a worker, one at a time from the caller's point of view: an answer to a request
 * that a newer one replaced is dropped. Without workers (old browsers), runs in place.
 */
export function createSimulator() {
  let worker: Worker | null = null
  try {
    worker = new SimWorker()
  } catch {
    worker = null
  }
  let latest = 0
  const waiting = new Map<number, (r: SimulationResult) => void>()
  if (worker)
    worker.onmessage = (e: MessageEvent<SimResponse>) => {
      const done = waiting.get(e.data.id)
      waiting.delete(e.data.id)
      if (done && e.data.id === latest) done(e.data.result)
    }

  return {
    /** Resolves with the result, or never if a newer request (or cancel) came first. */
    run(input: SimulationInput): Promise<SimulationResult> {
      const id = ++latest
      if (!worker) return Promise.resolve(simulate(input))
      const request: SimRequest = { id, input }
      return new Promise((resolve) => {
        waiting.set(id, resolve)
        worker.postMessage(request)
      })
    },
    /** Drops the answer of the request in progress (the program it was for is gone). */
    cancel() {
      latest++
    }
  }
}
