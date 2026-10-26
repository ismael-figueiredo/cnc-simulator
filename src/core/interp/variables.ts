// Macro B variable numbers: #0 (null), locals #1–#33, commons #100–#199 and #500–#999, system from #1000.

export const LAST_LOCAL = 33
export const LAST_COMMON = 999

/** System variables the interpreter reads or writes. */
export const SYSTEM = {
  /** #3000 = n: the program raises its own alarm n. */
  alarm: 3000,
  /** #3001, #3002: clocks (the simulator counts moves). */
  clocks: [3001, 3002],
  /** #3003, #3004: single block and feed hold control; accepted, not simulated. */
  control: [3003, 3004],
  /** #3006 = n: stop with a message. */
  message: 3006,
  /** #3011, #3012: date and time, read only. */
  dateTime: [3011, 3012],
  /** #3901, #3902: parts machined and parts required; accepted, not simulated. */
  partCount: [3901, 3902]
} as const

/** Modal information: #4001 motion group, #4003 G90/G91, #4109 F, #4119 S, #4120 T. */
export const MODAL = { motion: 4001, distance: 4003, feed: 4109, spindleSpeed: 4119, tool: 4120 } as const

export const isValidVariable = (n: number) => n === 0 || (n >= 1 && n <= LAST_LOCAL) || (n >= 100 && n <= 199) || (n >= 500 && n <= LAST_COMMON) || n >= 1000

/** Modal information and positions cannot be written. */
export const isReadOnly = (n: number) => (n >= 4000 && n <= 5999) || (SYSTEM.dateTime as readonly number[]).includes(n)

/** Writes the control accepts and the simulator has nothing to do with. */
const IGNORED_WRITES: readonly number[] = [...SYSTEM.clocks, ...SYSTEM.control, ...SYSTEM.partCount]
export const isIgnoredWrite = (n: number) => IGNORED_WRITES.includes(n)

/**
 * Position variables: #5001… absolute (work), #5021… machine, #5041… current position, for the
 * n-th axis of the machine (X Z C on a lathe, X Y Z on a mill), as the control numbers its axes.
 */
export function positionVariable(n: number): { frame: 'work' | 'machine' | 'current'; axisIndex: number } | null {
  if (n < 5001 || n > 5060) return null
  const group = Math.floor((n - 5001) / 20)
  return { frame: group === 0 ? 'work' : group === 1 ? 'machine' : 'current', axisIndex: (n - 5001) % 20 }
}
