import { describe, expect, it } from 'vitest'
import { upperOutsideComments } from '../src/renderer/editing'

describe('program editor text', () => {
  it('types programs in capitals, as on the control', () => {
    expect(upperOutsideComments('g01 x10.5 f0.2;', false)).toBe('G01 X10.5 F0.2;')
  })

  it('keeps comments as written', () => {
    expect(upperOutsideComments('g0 x1 (desbaste d40) m8', false)).toBe('G0 X1 (desbaste d40) M8')
    expect(upperOutsideComments('final do comentario) g1', true)).toBe('final do comentario) G1')
  })

  it('a new line ends a comment that was left open', () => {
    expect(upperOutsideComments('(sem fechar\ng1 z0', false)).toBe('(sem fechar\nG1 Z0')
  })
})
