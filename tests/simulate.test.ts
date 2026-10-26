import { describe, expect, it } from 'vitest'
import { simulate, type AlarmCatalog, type Control, type Machine, type ToolLibrary } from '../src/core'
import { alarmConfig, controlConfig, machineConfig, read, toolConfig } from './helpers/configs'
import { ansiSprocket, distanceToOutline } from './helpers/sprocket'

const romi: Machine = machineConfig('romi-gl250-m')
const fanucT: Control = controlConfig('fanuc-0i-tf-system-b')
const mill: Machine = machineConfig('mill-3axis')
const fanucM: Control = controlConfig('fanuc-0i-mf')
const library: ToolLibrary = toolConfig('sample-library')
const alarms: AlarmCatalog = alarmConfig('fanuc-0i')
const o1500 = read('examples/O1500_COROA_ANSI40.nc')

/** A program as the Romi expects it: "%" lines around it and ";" at the end of every block. */
const asFile = (lines: string[]) => ['%', ...lines.map((l) => `${l};`), '%'].join('\n')

const codesBySeverity = (r: ReturnType<typeof simulate>, s: string) =>
  r.diagnostics.filter((d) => d.severity === s).map((d) => `L${d.line + 1} ${d.code}`)

describe('O1500 sprocket on the Romi GL (Fanuc 0i-TF system B)', () => {
  it('runs to M30 without alarms or warnings', () => {
    const r = simulate({ text: o1500, control: fanucT, machine: romi, tools: library, alarms })
    expect(r.finished).toBe(true)
    expect(r.stoppedBy).toBeUndefined()
    expect(codesBySeverity(r, 'alarm')).toEqual([])
    expect(codesBySeverity(r, 'warning')).toEqual([])
    expect(r.tools.map((t) => [t.number, t.radius])).toEqual([
      [1, 4],
      [2, 3]
    ])
  })

  it.each([9, 15, 20])('with %i teeth the Ø6 cutter stays exactly one radius from the ANSI profile', (teeth) => {
    const r = simulate({ text: o1500, control: fanucT, machine: romi, tools: library, alarms, options: { forcedVariables: { 100: teeth } } })
    expect(codesBySeverity(r, 'alarm')).toEqual([])
    const gear = ansiSprocket(teeth)
    let min = Infinity
    for (const m of r.moves) {
      if (m.kind !== 'feed' || !m.toolCenter) continue
      for (const p of m.toolCenter) if (p[2] < 0) min = Math.min(min, distanceToOutline(p, gear.outline))
    }
    expect(min).toBeCloseTo(3, 3)
  })

  it('stops with PS3001 when the program refuses fewer than 9 teeth', () => {
    const r = simulate({ text: o1500, control: fanucT, machine: romi, tools: library, alarms, options: { forcedVariables: { 100: 8 } } })
    expect(r.stoppedBy?.alarm).toMatchObject({ code: 'PS3001', message: 'MINIMO 9 DENTES' })
    expect(r.moves).toEqual([])
  })

  it('the Ø8 relief holes leave stock on the profile', () => {
    const r = simulate({ text: o1500, control: fanucT, machine: romi, tools: library, alarms })
    const gear = ansiSprocket(15)
    const holes = r.moves.filter((m) => m.kind === 'feed' && m.toolRadius === 4)
    expect(holes).toHaveLength(15 * 4) // 15 teeth, 7.7 mm in 2 mm steps
    for (const m of holes) {
      const bottom = m.points[m.points.length - 1]
      if (bottom) expect(distanceToOutline(bottom, gear.outline) - 4).toBeGreaterThan(0.25)
    }
  })

  it('takes the tool radius from the comment when the library does not have the tool', () => {
    const r = simulate({ text: o1500, control: fanucT, machine: romi, tools: null, alarms })
    expect(r.tools.map((t) => t.radius)).toEqual([4, 3])
    expect(r.diagnostics.filter((d) => d.code === 'tool-radius-from-comment')).toHaveLength(2)
  })
})

describe('Romi manual example (G12.1 + G42 square, Ø12 cutter)', () => {
  const prog = asFile([
    'O0001 (INTERP. AXIAL)',
    'N10 G21 G40 G90 G95',
    'N20 G54 G0 X500 Z300 T00 M5',
    'N30 T0101 (FRESA D.12mm)',
    'N40 G97 S2=1500 M3',
    'N50 M19',
    'N60 G28 C0',
    'N70 G0 C0',
    'N80 G94',
    'N90 G0 X70 Z0',
    'N100 G1 Z-5 F1000',
    'N110 G12.1',
    'N120 G42 G1 X35 C0 F500',
    'N130 G1 X35 C17.5',
    'N140 G1 X-35 C17.5',
    'N150 G1 X-35 C-17.5',
    'N160 G1 X35 C-17.5',
    'N170 G1 X35 C5',
    'N180 G40 G1 X70 C0 F1000',
    'N190 G13.1',
    'N210 G54 G0 X500 Z300 T00 M5',
    'N220 M30'
  ])

  it('offsets the square by the tool radius with rounded outside corners', () => {
    const r = simulate({ text: prog, control: fanucT, machine: romi, alarms })
    expect(codesBySeverity(r, 'alarm')).toEqual([])
    expect(codesBySeverity(r, 'warning')).toEqual([])
    const side = r.moves.find((m) => m.line === 14) // N130 (file line 15): X35 C0 → X35 C17.5
    expect(side?.toolCenter?.[0]?.slice(0, 2)).toEqual([23.5, 0])
    expect(side?.toolCenter?.[1]?.slice(0, 2)).toEqual([23.5, 17.5])
    // the corner arc keeps the center at 6 mm from the corner (17.5, 17.5)
    const corner = side?.toolCenter?.slice(2) ?? []
    expect(corner.length).toBeGreaterThan(3)
    for (const p of corner) expect(Math.hypot(p[0] - 17.5, p[1] - 17.5)).toBeCloseTo(6, 6)
  })
})

describe('Macro B', () => {
  it('evaluates ATAN[y]/[x], precedence, null variables, WHILE and M98', () => {
    const prog = asFile([
      'O1',
      '#1=ATAN[1]/[1]',
      '#2=2+3*4-[1+1]',
      '#3=#0+1',
      '#4=0',
      'WHILE [#4 LT 3] DO1',
      '#4=#4+1',
      'END1',
      'IF [#5 EQ #0] THEN #6=1',
      'M98 P2000',
      'M30',
      'O2000',
      '#7=99',
      'M99'
    ])
    const r = simulate({ text: prog, control: fanucT, machine: romi, alarms })
    const last = new Map(r.variables.map((v) => [v.n, v.value]))
    expect(last.get(1)).toBeCloseTo(45, 9)
    expect(last.get(2)).toBe(12)
    expect(last.get(3)).toBe(1)
    expect(last.get(4)).toBe(3)
    expect(last.get(6)).toBe(1)
    expect(last.get(7)).toBe(99)
    expect(r.finished).toBe(true)
  })
})

describe('mill (Fanuc 0i-MF)', () => {
  it('drills with G81 and offsets a G41 contour in XY', () => {
    const prog = asFile([
      'O3000',
      'G21 G17 G90 G94',
      'T1 M06 (FRESA 10MM)',
      'S3000 M3',
      'G0 X0 Y0 Z5',
      'G81 X10 Y10 Z-5 R2 F100',
      'X20',
      'G80',
      'G0 X-10 Y0',
      'G1 Z-2 F200',
      'G41 G1 X0 Y0',
      'G1 X40',
      'G1 Y30',
      'G40 G1 X50 Y40',
      'G0 Z50',
      'M30'
    ])
    const r = simulate({ text: prog, control: fanucM, machine: mill, alarms })
    expect(codesBySeverity(r, 'alarm')).toEqual([])
    const drills = r.moves.filter((m) => m.kind === 'feed' && m.line >= 6 && m.line <= 7)
    expect(drills.map((m) => m.points[m.points.length - 1])).toEqual([
      [10, 10, -5],
      [20, 10, -5]
    ])
    const bottom = r.moves.find((m) => m.line === 12) // G1 X40 along Y0, tool on the left → Y+5
    expect(bottom?.toolCenter?.[0]?.[1]).toBeCloseTo(5, 9)
  })
})
