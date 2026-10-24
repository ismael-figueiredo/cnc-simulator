// Runs the interpreter off the UI thread: a long program no longer freezes the window while it is simulated.
import { simulate, type SimulationInput, type SimulationResult } from '@core/index'

export interface SimRequest {
  id: number
  input: SimulationInput
}
export interface SimResponse {
  id: number
  result: SimulationResult
}

// The renderer's lib types `self` as a window; in a worker postMessage takes just the message
const scope = self as unknown as { onmessage: ((e: MessageEvent<SimRequest>) => void) | null; postMessage: (m: SimResponse) => void }
scope.onmessage = (e) => {
  scope.postMessage({ id: e.data.id, result: simulate(e.data.input) })
}
