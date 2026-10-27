import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { simulate, type Control } from '../src/core'
import { controlConfig, machineConfig, root } from './helpers/configs'

const gl300 = machineConfig('romi-gl300')
const lathe = controlConfig('fanuc-0i-tf-system-b')
const d600 = machineConfig('romi-d600')
const mill = controlConfig('fanuc-0i-mf')
const turn = (blocks: string[]) => simulate({ text: ['%', 'O0001;', 'G21 G95;', 'T0101;', ...blocks.map((b) => `${b};`), '%'].join('\n'), machine: gl300, control: lathe })
const codes = (r: ReturnType<typeof simulate>) => r.diagnostics.map((d) => d.code)

describe('M codes', () => {
  it('ends on M30 with the state the last blocks leave: spindle and coolant off', () => {
    const r = turn(['G97 S1000 M3', 'M8', 'G0 X52 Z2', 'G1 Z-20 F0.2', 'G0 X60 Z5', 'M9', 'M5', 'M30'])
    expect(r.finished).toBe(true)
    expect(r.end).toMatchObject({ code: 'M30', line: 11 })
    expect(r.end?.state).toMatchObject({ spindleOn: false, coolant: false })
    // The last move was made with the spindle on and the coolant flowing
    expect(r.moves.at(-1)?.state).toMatchObject({ spindleOn: true, coolant: true })
  })

  it('has no end when the program does not finish', () => {
    expect(turn(['G97 S1000 M3', 'G0 X52 Z2']).end).toBeUndefined()
  })

  it('tells M03 from M04', () => {
    const r = turn(['G97 S800 M4', 'G0 X52 Z2', 'M3', 'G0 X50', 'M30'])
    expect(r.moves.map((m) => m.state.spindleCcw)).toEqual([true, false])
  })

  it('stops at M00 after the move of its block, as the control does', () => {
    const r = turn(['G97 S1000 M3', 'G0 X52 Z2 M0', 'G0 X60', 'M30'])
    const stop = r.diagnostics.find((d) => d.code === 'program-stop')
    expect(stop?.moveIndex).toBe(1)
  })

  it('stops the spindle after the move of an M05 block, so that move still cuts at speed', () => {
    const r = turn(['G97 S1000 M3', 'G0 X52 Z2', 'G1 Z-20 F0.2 M5', 'G0 X60', 'M30'])
    expect(codes(r)).not.toContain('spindle-not-running')
    expect(r.moves[1]?.state.spindleOn).toBe(true)
    expect(r.moves[2]?.state.spindleOn).toBe(false)
  })

  it('times a feed per revolution with the spindle stopped as a wait, with a warning', () => {
    const r = turn(['G97 S1000 M3', 'G0 X52 Z2', 'M5', 'G1 Z-20 F0.2', 'M30'])
    expect(codes(r)).toContain('spindle-not-running')
  })

  it('ends a machining center program with M02 too', () => {
    const r = simulate({ text: '%\nO0001\nG90 G54 G0 X0 Y0\nM02\n%', machine: d600, control: mill })
    expect(codes(r)).not.toContain('unknown-m-code')
    expect(r.end?.code).toBe('M02')
  })

  it('every control has the basic M functions', () => {
    const ids = readdirSync(join(root, 'configs/controls')).map((f) => f.replace(/\.json$/, ''))
    for (const id of ids) {
      const c: Control = controlConfig(id)
      const functions = new Set(Object.values(c.mCodes).map((m) => m.function))
      // Siemens calls subprograms with L n (and returns with M17), not with an M code
      const expected = ['stop', 'optional-stop', 'end', 'end-rewind', 'spindle-cw', 'spindle-ccw', 'spindle-stop', 'coolant-on', 'coolant-off', 'subprogram-return']
      for (const fn of c.family === 'siemens' ? expected : [...expected, 'subprogram-call']) expect(functions.has(fn as never), `${id} ${fn}`).toBe(true)
    }
  })
})
