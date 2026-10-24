import { z } from 'zod'

// Config file formats. Inspired by the LinuxCNC INI (machine), the FreeCAD/Fusion
// post-processors (control) and the CAMotics tool table (tools).

/** A plain string, or one string per language: { "en": "...", "pt-BR": "...", "es": "..." }. */
export const LocalizedTextSchema = z.union([z.string(), z.record(z.string(), z.string())])

export const AxisNameSchema = z.enum(['X', 'Y', 'Z', 'A', 'B', 'C', 'U', 'V', 'W'])

export const AxisSchema = z.object({
  name: AxisNameSchema,
  type: z.enum(['linear', 'rotary']),
  min: z.number(),
  max: z.number(),
  /** mm/min (linear) or deg/min (rotary). */
  rapid: z.number().positive(),
  /** Lathe: X programmed as diameter. */
  diameter: z.boolean().optional(),
  /** -1 flips the physical direction (e.g. Fanuc parameter 4000.1 for C). */
  direction: z.union([z.literal(1), z.literal(-1)]).optional()
})

export const SpindleSchema = z.object({
  id: z.string(),
  name: LocalizedTextSchema,
  type: z.enum(['main', 'sub', 'live', 'spindle']),
  maxRpm: z.number().positive()
})

/** Raw material. Cylinder: face at Z0, body toward -Z. Block: corner at X0 Y0, top at Z0. */
export const StockShapeSchema = z.object({
  shape: z.enum(['cylinder', 'block']),
  diameter: z.number().positive().optional(),
  length: z.number().positive().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  z: z.number().optional()
})

export const MachineSchema = z.object({
  id: z.string(),
  name: z.string(),
  manufacturer: z.string().optional(),
  type: z.enum(['lathe', 'mill-turn', 'mill', 'machining-center', 'router']),
  kinematics: z.enum(['lathe-xz', 'lathe-xzc', 'lathe-xyzc', 'mill-xyz', 'mill-xyza', 'mill-5axis']),
  axes: z.array(AxisSchema).min(2),
  spindles: z.array(SpindleSchema).min(1),
  turret: z
    .object({
      positions: z.number().int().positive(),
      type: z.enum(['VDI', 'BMT', 'disc', 'changer', 'gang'])
    })
    .optional(),
  /** Where G53 X0 Z0 (machine zero) sits in part coordinates, to draw tool changes. */
  toolChangePosition: z.record(z.string(), z.number()),
  defaultControl: z.string(),
  /** Tool library (configs/tools id) used when a program is opened without a project. */
  defaultTools: z.string().optional(),
  /** Remarks for whoever maintains the file, e.g. data still to be checked on the machine plate. */
  notes: LocalizedTextSchema.optional(),
  defaultStock: StockShapeSchema.optional()
})

/** Functions the interpreter understands. Each control maps its own codes to them. */
export const GFunction = z.enum([
  'rapid', 'linear', 'arc-cw', 'arc-ccw', 'dwell',
  'plane-xy', 'plane-zx', 'plane-yz', 'inch', 'metric',
  'reference-return', 'machine-coords', 'work-offset', 'set-origin',
  // G10 programmable data input: work offsets (L2, L20); other L numbers are not simulated
  'data-setting',
  'polar-on', 'polar-off', 'cylindrical',
  'cutter-comp-cancel', 'cutter-comp-left', 'cutter-comp-right', 'tool-length-comp', 'tool-length-comp-cancel',
  'absolute', 'incremental', 'feed-per-minute', 'feed-per-rev', 'constant-surface-speed', 'constant-rpm',
  'drill', 'peck-drill', 'tap', 'bore', 'radial-drill', 'radial-tap', 'canned-cycle-cancel',
  'return-initial', 'return-r',
  'turning-cycle', 'facing-cycle', 'threading-cycle', 'roughing-cycle', 'finishing-cycle',
  // Fanuc/Mitsubishi lathe G71 (turning), G72 (facing), G73 (pattern) roughing, G76 multiple threading,
  // G32/G33 thread cutting
  'rough-turn-cycle', 'rough-face-cycle', 'pattern-cycle', 'thread-multi-cycle', 'thread-cut',
  // Fanuc lathe G74/G75: one-shot peck cycles along Z (face) or X (grooving)
  'face-peck-cycle', 'groove-cycle',
  'macro-call', 'macro-modal', 'macro-modal-cancel',
  // Accepted by the control but not drawn yet: the "on" side warns, the "off" side is silent
  'polar-coords-on', 'polar-coords-off', 'mirror-on', 'mirror-off', 'rotation-on', 'rotation-off',
  'local-coords', 'circle-cutting', 'not-simulated',
  'other'
])

export const MFunction = z.enum([
  'stop', 'optional-stop', 'end', 'end-rewind',
  'spindle-cw', 'spindle-ccw', 'spindle-stop',
  'live-tool-cw', 'live-tool-ccw', 'live-tool-stop',
  'c-axis-on', 'c-axis-off', 'brake-on', 'brake-off',
  'coolant-on', 'coolant-off',
  'tool-change', 'subprogram-call', 'subprogram-return', 'other'
])

const code = <T extends z.ZodType>(fn: T) => z.object({ function: fn, description: LocalizedTextSchema.optional() })

export const ControlSchema = z.object({
  id: z.string(),
  name: z.string(),
  family: z.enum(['fanuc', 'haas', 'siemens', 'heidenhain', 'mazak', 'mitsubishi', 'linuxcnc', 'grbl', 'generic']),
  machineType: z.enum(['lathe', 'mill']),
  dialect: z.object({
    /** Fanuc lathe: A (U/W, G98/G99) or B (G90/G91, G94/G95). Mills use "M". */
    gCodeSystem: z.enum(['A', 'B', 'C', 'M']),
    decimalPoint: z.enum(['calculator', 'standard']),
    xDiameter: z.boolean(),
    macro: z.enum(['fanuc-b', 'linuxcnc-o', 'siemens', 'none']),
    comment: z.enum(['parentheses', 'semicolon']),
    /** Live tool speed address, e.g. "S2=" on Romi lathes. */
    liveToolSpeedAddress: z.string().optional(),
    /** Incremental address → axis, e.g. { "U": "X", "W": "Z" }. */
    incrementalAddresses: z.record(z.string(), z.string()).optional(),
    /**
     * A decimal point on an integer address (M, N, O, T, D, H, L, P): Fanuc raises an alarm,
     * Mitsubishi drops the decimals. Defaults to "alarm".
     */
    integerAddressDecimal: z.enum(['alarm', 'ignore']).optional(),
    /**
     * Lathe option: chamfer and corner R also with C and R without comma in a one-axis G01 block
     * (Fanuc T, needs a machine without C axis). ",C" and ",R" always work.
     */
    cornerWithoutComma: z.boolean().optional()
  }),
  gCodes: z.record(z.string(), code(GFunction)),
  mCodes: z.record(z.string(), code(MFunction)),
  /** Extra checks for this control (ids known by the interpreter). */
  rules: z.array(z.string()).optional(),
  /** Id of the alarm catalog (configs/alarms) that turns checks into this control's alarm numbers. */
  alarms: z.string().optional(),
  /** What the control accepts when a program file is loaded, like its I/O parameters. */
  fileFormat: z
    .object({
      /** The file must start with "%" (end of record / leader). */
      startPercent: z.boolean(),
      /** The file must end with "%"; reaching it without M30/M02/M99 raises the end-of-record alarm. */
      endPercent: z.boolean(),
      /** Every block must end with ";" (EOB), or the line feed is enough. */
      eob: z.enum(['semicolon', 'newline']),
      missingEob: z.enum(['alarm', 'warning', 'off']),
      programNumber: z.enum(['required', 'optional']),
      /** Fanuc parameter 3404#1 (POL): an axis value without a decimal point is an error. */
      requireDecimalPoint: z.boolean()
    })
    .partial()
    .optional(),
  /** Numeric limits of the control. */
  limits: z
    .object({
      /** Digits allowed in a number (Fanuc: 8). */
      maxDigits: z.number().int().positive(),
      /** Largest absolute value of an axis or feed word. */
      maxValue: z.number().positive(),
      subprogramNesting: z.number().int().positive(),
      macroNesting: z.number().int().positive(),
      bracketNesting: z.number().int().positive(),
      /** DO1…DOn */
      loopIds: z.number().int().positive(),
      maxSequenceNumber: z.number().int().positive(),
      maxProgramNumber: z.number().int().positive(),
      /** Blocks without movement allowed in a row with cutter compensation active. */
      compNoMoveBlocks: z.number().int().nonnegative(),
      /** Largest difference between start and end radius of an arc (Fanuc parameter 3410). */
      arcTolerance: z.number().positive(),
      toolOffsets: z.number().int().positive()
    })
    .partial()
    .optional()
})

/** A control's own alarm numbers and screen messages, and which simulator check raises each one. */
export const AlarmCatalogSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Shown before the number, e.g. "PS" → "PS0010". */
  prefix: z.string(),
  digits: z.number().int().positive(),
  /** #3000 = n raises alarm base + n. */
  macroAlarmBase: z.number().int().nonnegative().optional(),
  /** Alarm number → message as the control displays it. */
  alarms: z.record(z.string(), z.string()),
  /** Simulator diagnostic code → alarm number. Mapped checks stop the program like the machine does. */
  map: z.record(z.string(), z.number().int().nonnegative())
})

export const HolderSchema = z.object({
  id: z.string(),
  name: LocalizedTextSchema,
  standard: z.enum(['BT30', 'BT40', 'BT50', 'CAT40', 'HSK63A', 'HSK100A', 'SK40', 'VDI30', 'VDI40', 'BMT45', 'BMT55', 'BMT65', 'ER', 'other']),
  driven: z.boolean().optional(),
  orientation: z.enum(['axial', 'radial']).optional(),
  /** Revolution profile [radius, length] in mm, from the spindle face toward the tip. */
  profile: z.array(z.tuple([z.number(), z.number()])).optional()
})

export const ToolSchema = z.object({
  number: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative().optional(),
  name: LocalizedTextSchema,
  type: z.enum(['flat-endmill', 'ball-endmill', 'bull-endmill', 'drill', 'tap', 'chamfer-mill', 'turning-insert', 'grooving', 'threading', 'boring-bar']),
  diameter: z.number().nonnegative(),
  length: z.number().positive(),
  fluteLength: z.number().positive().optional(),
  cornerRadius: z.number().nonnegative().optional(),
  /** Fanuc tip direction (1–9) for lathe nose radius compensation. */
  tipDirection: z.number().int().min(0).max(9).optional(),
  flutes: z.number().int().positive().optional(),
  holder: z.string().optional(),
  /** Rotating tools on a lathe (live tooling): along Z toward the face, or along X toward the axis. Default: the holder's. */
  mount: z.enum(['axial', 'radial']).optional(),
  /** Turning tools: outside diameter or bore. */
  side: z.enum(['external', 'internal']).optional(),
  /** Turning tools: right hand cuts toward the chuck (−Z), left hand away from it. */
  hand: z.enum(['right', 'left']).optional(),
  /** ISO insert shape: C 80°, D 55°, V 35°, W 80° trigon, T 60° triangle, S 90° square, R round. */
  insert: z.enum(['C', 'D', 'V', 'W', 'T', 'S', 'R']).optional()
})

export const ToolLibrarySchema = z.object({
  id: z.string(),
  name: LocalizedTextSchema,
  units: z.literal('mm'),
  holders: z.array(HolderSchema),
  tools: z.array(ToolSchema)
})

export type LocalizedTextValue = z.infer<typeof LocalizedTextSchema>
export type Axis = z.infer<typeof AxisSchema>
export type Spindle = z.infer<typeof SpindleSchema>
export type AxisName = z.infer<typeof AxisNameSchema>
export type StockShape = z.infer<typeof StockShapeSchema>
export type Machine = z.infer<typeof MachineSchema>
export type Control = z.infer<typeof ControlSchema>
export type Holder = z.infer<typeof HolderSchema>
export type Tool = z.infer<typeof ToolSchema>
export type ToolLibrary = z.infer<typeof ToolLibrarySchema>
export type AlarmCatalog = z.infer<typeof AlarmCatalogSchema>
