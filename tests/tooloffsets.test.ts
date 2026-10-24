import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultToolOffsets, loadControl, loadMachine, loadToolLibrary, simulate, type ToolOffsets, type Move } from '../src/core'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
function load<T>(r: { ok: true; value: T } | { ok: false; issues: unknown[] }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r.value
}
const d600 = load(loadMachine(read('configs/machines/romi-d600.json')))
const fanucM = load(loadControl(read('configs/controls/fanuc-0i-mf-romi-d.json')))
const bt40 = load(loadToolLibrary(read('configs/tools/machining-center.json')))
const gl300 = load(loadMachine(read('configs/machines/romi-gl300.json')))
const fanucT = load(loadControl(read('configs/controls/fanuc-0i-tf-system-b.json')))
const turning = load(loadToolLibrary(read('configs/tools/lathe-turning.json')))

const mill = (blocks: string[], toolOffsets?: ToolOffsets) =>
  simulate({ text: ['%', 'O0001', 'G21 G17 G90 G40 G49', ...blocks, 'M30', '%'].join('\n'), machine: d600, control: fanucM, tools: bt40, toolOffsets, workOffsets: { G54: { X: 200, Y: 200, Z: -400 } } })
const lathe = (blocks: string[], toolOffsets?: ToolOffsets) =>
  simulate({ text: ['%', 'O0001;', 'G21 G18 G40 G95;', ...blocks.map((b) => `${b};`), 'M30;', '%'].join('\n'), machine: gl300, control: fanucT, tools: turning, toolOffsets })
const end = (m: Move | undefined) => (m?.points[m.points.length - 1] ?? []).map((v) => Math.round(v * 1000) / 1000)
const codes = (r: ReturnType<typeof simulate>) => r.diagnostics.map((d) => d.code)

// T2: Ø12 endmill, 45 mm out of a Weldon holder 80 mm long: 125 mm from the spindle gauge line
const T2 = ['T2 M6', 'G54 G0 X10 Y10 S3000 M3']

describe('tool length (G43)', () => {
  it('defaults H to the gauge length of each tool', () => {
    expect(defaultToolOffsets(bt40, false)['2']).toEqual({ length: 125, radius: 6 })
  })

  it('puts the gauge line at Z + H in machine coordinates and the tip on the program', () => {
    const r = mill([...T2, 'G43 Z5 H2', 'G1 Z-2 F300'])
    const cut = r.moves[r.moves.length - 1]
    expect(end(cut)[2]).toBe(-2)
    // Machine Z: −2 + G54 Z −400 + H 125
    expect(cut?.machinePosition.Z).toBeCloseTo(-277, 6)
    expect(codes(r)).not.toContain('length-comp-off')
  })

  it('draws the tip where it really goes with a wrong H, and says so', () => {
    const r = mill([...T2, 'G43 Z5 H1', 'G1 Z-2 F300'])
    // H1 is the Ø50 face mill: 45 + 60 = 105 mm, 20 mm shorter than T2
    expect(end(r.moves[r.moves.length - 1])[2]).toBe(-22)
    expect(r.diagnostics.find((d) => d.code === 'length-offset-mismatch')?.params).toMatchObject({ h: 1, value: 105, tool: 2, actual: 125, diff: -20 })
  })

  it('warns when cutting without G43', () => {
    expect(r0().diagnostics.find((d) => d.code === 'length-comp-off')?.params).toMatchObject({ tool: 2, length: 125 })
    function r0() {
      return mill([...T2, 'G0 Z5', 'G1 Z-2 F300'])
    }
  })

  it('lets wear take the tip deeper', () => {
    const r = mill([...T2, 'G43 Z5 H2', 'G1 Z-2 F300'], { ...defaultToolOffsets(bt40, false), '2': { length: 125, lengthWear: -0.05, radius: 6 } })
    expect(end(r.moves[r.moves.length - 1])[2]).toBeCloseTo(-2.05, 6)
  })

  it('G10 L10/L11 write the length while the program runs', () => {
    const r = mill([...T2, 'G10 L10 P2 R124', 'G43 Z5 H2', 'G1 Z-2 F300'])
    expect(end(r.moves[r.moves.length - 1])[2]).toBe(-3)
    expect(codes(r)).toContain('tool-offset-set')
  })
})

describe('tool radius (D)', () => {
  it('takes the cutter compensation radius from D, wear included', () => {
    const offsets = { ...defaultToolOffsets(bt40, false), '12': { radius: 6, radiusWear: 0.1 } }
    const r = mill([...T2, 'G43 Z5 H2', 'G1 Z-2 F300', 'G41 D12 G1 X20 Y0', 'G1 X60', 'G40 G1 X70 Y-10'], offsets)
    const line = r.moves.find((m) => m.element && end(m)[0] === 60)
    // Tool on the left of a +X line: center 6.1 mm toward +Y
    expect(line?.toolCenter?.[1]?.[1]).toBeCloseTo(6.1, 6)
  })
})

describe('lathe offsets', () => {
  it('moves the tip by the X and Z wear of the T word offset', () => {
    const offsets: ToolOffsets = { ...defaultToolOffsets(turning, true), '1': { x: 0, z: 0, xWear: -0.04, zWear: 0.02, nose: 0.8, tip: 3 } }
    const r = lathe(['T0101', 'G97 S1000 M03', 'G00 X40. Z2.', 'G01 Z-20. F0.2'], offsets)
    // Diameter −0.04 → radius −0.02
    expect(end(r.moves[r.moves.length - 1])).toEqual([19.98, 0, -19.98])
  })

  it('adds the geometry to the machine position (turret)', () => {
    const offsets: ToolOffsets = { '1': { x: -180.5, z: -250.2 } }
    const r = lathe(['T0101', 'G97 S1000 M03', 'G00 X40. Z2.'], offsets)
    const m = r.moves[r.moves.length - 1]
    expect((m?.machinePosition.X ?? 0) - (m?.position.X ?? 0)).toBeCloseTo((r.moves[0]?.machinePosition.X ?? 0) - (r.moves[0]?.position.X ?? 0), 6)
    expect(m?.machinePosition.Z).toBeCloseTo((m?.position.Z ?? 0) - (gl300.toolChangePosition['Z'] ?? 0) - 250.2, 6)
  })

  it('G10 P n writes the wear (U W incremental), P 10000+n the geometry', () => {
    const r = lathe(['T0101', 'G97 S1000 M03', 'G10 P1 X-0.1 Z0', 'G10 P1 U0.06', 'G00 X40. Z2.', 'G01 Z-20. F0.2'])
    // Wear X −0.1 + 0.06 = −0.04 → radius −0.02
    expect(end(r.moves[r.moves.length - 1])[0]).toBeCloseTo(19.98, 6)
  })
})

describe('nose radius compensation (lathe G41/G42)', () => {
  // T01: CNMG with 0.8 mm nose radius (offset 1 by default)
  const profile = ['T0101', 'G97 S1000 M03', 'G00 X20. Z2.', 'G42 G01 Z0 F0.2', 'X40.', 'Z-20.', 'G40 G01 X50.']

  it('keeps the nose center one radius outside the part, along Z and up the face', () => {
    const r = lathe(profile)
    expect(r.diagnostics.filter((d) => d.severity === 'alarm')).toEqual([])
    const along = r.moves.find((m) => m.compPlane === 'zx' && end(m)[2] === -20 && end(m)[0] === 20)
    // On the Ø40 the center runs at radius 20.8
    for (const p of along?.toolCenter ?? []) expect(p[0]).toBeCloseTo(20.8, 6)
    const face = r.moves.find((m) => m.compPlane === 'zx' && end(m)[0] === 20 && end(m)[2] === 0)
    // Up the face at Z0 the center is 0.8 in front of it
    expect(face?.toolCenter?.[0]?.[2]).toBeCloseTo(0.8, 6)
  })

  it('takes the radius from the nose radius offset, wear included', () => {
    const offsets: ToolOffsets = { ...defaultToolOffsets(turning, true), '1': { x: 0, z: 0, nose: 0.4, noseWear: 0.1, tip: 3 } }
    const along = lathe(profile, offsets).moves.find((m) => m.compPlane === 'zx' && end(m)[2] === -20 && end(m)[0] === 20)
    expect(along?.toolCenter?.[1]?.[0]).toBeCloseTo(20.5, 6)
  })
})

describe('reference return with offsets', () => {
  it('takes the gauge line to machine zero: no overtravel, the tip H below it', () => {
    const r = mill([...T2, 'G43 Z5 H2', 'G1 Z-2 F300', 'G91 G28 Z0', 'G90'])
    const back = r.moves[r.moves.length - 1]
    expect(back?.machinePosition.Z).toBeCloseTo(0, 6)
    expect(r.diagnostics.map((d) => d.code)).not.toContain('overtravel')
    // Machine zero is G54 Z +400 above the part zero; the tip hangs 125 mm (H2) below it
    expect(end(back)[2]).toBeCloseTo(400 - 125, 6)
  })
})
