// Shapes produced by the simulator.
import type { DiagnosticCode } from './interp/diagnostics'

/** Point in part space: x,y on the face/table plane, z along the spindle (lathe) or tool axis (mill). */
export type Vec3 = readonly [number, number, number]
export type Vec2 = readonly [number, number]

export type Severity = 'alarm' | 'warning' | 'info'

/**
 * Diagnostic produced by the core. It carries a code and parameters instead of a sentence,
 * so each UI language renders its own text (i18n key "diag.<code>").
 */
export interface Diagnostic {
  severity: Severity
  /** File line, starting at 0. */
  line: number
  code: DiagnosticCode
  params?: Record<string, string | number>
  /** The control's own alarm, when its catalog maps this code (e.g. PS0010 IMPROPER G-CODE). */
  alarm?: MachineAlarm
  /** Number of moves made before it was raised. */
  moveIndex?: number
}

export interface MachineAlarm {
  /** As shown by the control, e.g. "PS0010". */
  code: string
  /** Screen message, e.g. "IMPROPER G-CODE". */
  message: string
  /** The machine stops at this block. */
  stops: boolean
}

export type MoveKind = 'rapid' | 'feed' | 'dwell'

/** Modal state recorded at the end of each move, for the position panel. */
export interface ModalState {
  motion: 0 | 1 | 2 | 3
  absolute: boolean
  plane: 17 | 18 | 19
  polar: boolean
  cutterComp: 40 | 41 | 42
  feed: number
  feedPerMinute: boolean
  spindleSpeed: number
  liveToolSpeed: number
  spindleOn: boolean
  liveToolOn: boolean
  tool: number
  offset: number
  cAxisEnabled: boolean
  brake: boolean
  /** Active canned cycle code, e.g. "G83". */
  cycle: string | null
  /** Active work offset, e.g. "G54" or "G54.1 P3". */
  workOffset: string
}

/** Program coordinates at the end of a move (X as programmed: diameter on lathes). */
export interface ProgramPosition {
  X: number
  Y: number
  Z: number
  A: number
  B: number
  C: number
}

/** Line or arc in the compensation plane (world x,y), used to compute the tool center. */
export type PlaneElement =
  | { type: 'line'; p0: Vec2; p1: Vec2 }
  | { type: 'arc'; p0: Vec2; p1: Vec2; center: Vec2; radius: number; cw: boolean; sweep: number }

export interface Move {
  kind: MoveKind
  line: number
  /** Sampled points of the programmed path, in world coordinates. */
  points: Vec3[]
  /** Tool center when cutter compensation is active; otherwise undefined (center = points). */
  toolCenter?: Vec3[]
  toolRadius: number
  durationS: number
  state: ModalState
  /** Absolute position in the active work offset, as the control's ABSOLUTE screen shows it. */
  position: ProgramPosition
  /** Machine coordinates (G53), as the MACHINE screen shows them. */
  machinePosition: ProgramPosition
  /** Made in the compensation plane (polar mode, XY on a mill, ZX when turning). */
  inCompPlane?: boolean
  /** Plane of `element`: absent for XY (u = x, v = y); 'zx' when turning (u = z, v = radius). */
  compPlane?: 'zx'
  /** Geometry in the compensation plane; absent for Z-only moves. */
  element?: PlaneElement
  compStart?: 41 | 42
  compCancel?: boolean
  /** Thread cutting, tied to the spindle: the feed override does not apply, the spindle override does. */
  thread?: boolean
}

export interface ToolUse {
  number: number
  line: number
  name: string
  radius: number
}

export interface VariableChange {
  /** Index of the next move when the variable changed. */
  moveIndex: number
  n: number
  value: number | null
}

export interface Program {
  name: string
  text: string
}

export interface SimulationResult {
  moves: Move[]
  diagnostics: Diagnostic[]
  /** Reached M30/M02 (or M99 in the main program). */
  finished: boolean
  /** The alarm that stopped the program, if any. */
  stoppedBy?: Diagnostic
  totalTimeS: number
  tools: ToolUse[]
  variables: VariableChange[]
}
