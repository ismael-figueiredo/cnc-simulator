import { describe, expect, it } from 'vitest'
import { parseProgram } from '../src/core'

const fanuc = (text: string) => parseProgram(text, 'parentheses')

describe('program parser', () => {
  it('strips spaces, comments and block numbers, and keeps the comment text', () => {
    const { blocks } = fanuc('%\nO1000 (EIXO);\nN10 g0 x10. z2. (DESBASTE) ;\n%')
    expect(blocks).toEqual([
      { line: 1, text: '', raw: '', n: null, blockDelete: false, comment: 'EIXO', programNumber: 1000 },
      { line: 2, text: 'G0X10.Z2.', raw: 'G0 X10. Z2.', n: 10, blockDelete: false, comment: 'DESBASTE' }
    ])
  })

  it('maps each program number to its marker block, also with ":"', () => {
    const { programs, blocks } = fanuc('%\nO1;\nG0X0;\nM30;\n:2000 G0 X1;\nM99;\n%')
    expect([...programs]).toEqual([
      [1, 0],
      [2000, 3]
    ])
    expect(blocks[4]?.text).toBe('G0X1')
  })

  it('marks block delete', () => {
    const { blocks } = fanuc('/ N20 M0;')
    expect(blocks[0]).toMatchObject({ text: 'M0', n: 20, blockDelete: true })
  })

  it('reads the file layout for the load checks', () => {
    const { layout } = fanuc('\n%\nO1;\nG0 X0\nG1 X1 (OPEN;\nM30;\n%\nIGNORED;')
    expect(layout).toEqual({ startPercent: true, endPercent: true, endLine: 6, missingEob: [3], unclosedComments: [4], firstBlockLine: 2 })
  })

  it('without "%", the file ends at its last line and blocks after it still count', () => {
    const { layout, blocks } = fanuc('G0 X0;\r\nM30;')
    expect(layout).toMatchObject({ startPercent: false, endPercent: false, endLine: 1, firstBlockLine: 0 })
    expect(blocks.map((b) => b.text)).toEqual(['G0X0', 'M30'])
  })

  it('reads ";" comments for controls that use them (Siemens-style)', () => {
    const { blocks, layout } = parseProgram('N10 G0 X0 ; rapid to zero\n; only a comment\n', 'semicolon')
    expect(blocks).toEqual([{ line: 0, text: 'G0X0', raw: 'G0 X0', n: 10, blockDelete: false, comment: 'rapid to zero' }])
    expect(layout.missingEob).toEqual([])
  })
})
