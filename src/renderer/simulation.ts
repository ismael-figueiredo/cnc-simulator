import { simulate, type SimulationInput, type SimulationResult } from '@core/index'
import type { SimRequest, SimResponse } from './simulation.worker'
// Inlined as a blob URL, so it loads the same from file:// (desktop) and http:// (browser mode)
import SimWorker from './simulation.worker?worker&inline'

/** Runs in place, as a promise: without workers (old browsers) or when the worker failed. */
const inPlace = (input: SimulationInput) => new Promise<SimulationResult>((resolve) => resolve(simulate(input)))

/**
 * Simulations in a worker, one at a time from the caller's point of view: an answer to a request
 * that a newer one replaced is dropped. The worker starts on the first run and ends with dispose().
 */
export function createSimulator() {
  let worker: Worker | null = null
  let latest = 0
  const waiting = new Map<number, { input: SimulationInput; resolve: (r: SimulationResult) => void; reject: (e: unknown) => void }>()

  function start(): Worker | null {
    if (worker) return worker
    try {
      worker = new SimWorker()
    } catch {
      return null
    }
    worker.onmessage = (e: MessageEvent<SimResponse>) => {
      const job = waiting.get(e.data.id)
      waiting.delete(e.data.id)
      if (job && e.data.id === latest) job.resolve(e.data.result)
    }
    // The worker died (an error in the interpreter): answer the latest request here, so it does not wait forever
    worker.onerror = (e) => {
      e.preventDefault()
      const job = waiting.get(latest)
      waiting.clear()
      dispose()
      if (job) inPlace(job.input).then(job.resolve, job.reject)
    }
    return worker
  }

  function dispose() {
    worker?.terminate()
    worker = null
    waiting.clear()
  }

  return {
    /** Resolves with the result, or never if a newer request (or cancel) came first. */
    run(input: SimulationInput): Promise<SimulationResult> {
      const id = ++latest
      const w = start()
      if (!w) return inPlace(input)
      const request: SimRequest = { id, input }
      return new Promise((resolve, reject) => {
        waiting.set(id, { input, resolve, reject })
        w.postMessage(request)
      })
    },
    /** Drops the answer of the request in progress (the program it was for is gone). */
    cancel() {
      latest++
    },
    /** Stops the worker (the tab closed); a later run starts a new one. */
    dispose
  }
}
