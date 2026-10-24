import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadControl, type Control } from '../src/core'
import { localize, type LocalizedText } from '../src/i18n'
import { HELP } from '../src/i18n/help'
import { explainLine, helpForWord } from '../src/renderer/help'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
function load<T>(r: { ok: true; value: T } | { ok: false; issues: unknown[] }): T {
  if (!r.ok) throw new Error(JSON.stringify(r.issues))
  return r.value
}
const lathe: Control = load(loadControl(read('configs/controls/fanuc-0i-tf-system-b.json')))
const haas: Control = load(loadControl(read('configs/controls/haas-ngc-mill.json')))
const pt = (t: LocalizedText | undefined) => localize(t, 'pt-BR')
const en = (t: LocalizedText | undefined) => localize(t, 'en')

describe('learning help', () => {
  it('explains a code by the function it has on the selected control', () => {
    expect(helpForWord('G71', lathe, en)).toContain('Stock removal in turning')
    expect(helpForWord('G1', lathe, en)).toContain('Straight cut')
    expect(helpForWord('M3', lathe, pt)).toContain('horário')
    expect(helpForWord('M97', haas, en)).toContain('Haas local subprogram')
  })

  it('says when the control does not have the code', () => {
    expect(helpForWord('G999', lathe, en)).toContain('does not have this code')
  })

  it('explains variables, macro words and addresses', () => {
    expect(helpForWord('#100', lathe, en)).toContain('Common variable')
    expect(helpForWord('#5001', lathe, en)).toContain('System variable')
    expect(helpForWord('#1', lathe, en)).toContain('Local variable')
    expect(helpForWord('WHILE', lathe, en)).toContain('repeats')
    expect(helpForWord('GT', lathe, en)).toContain('greater')
    expect(helpForWord('U', lathe, en)).toContain('Incremental X')
  })

  it('lists every word of a block once, codes first, without comments', () => {
    const words = explainLine('N20 G71 P10 Q20 U0.4 W0.1 F0.25 (DESBASTE X50);', lathe, en).map((w) => w.word)
    expect(words).toEqual(['G71', 'N', 'P', 'Q', 'U', 'W', 'F'])
    expect(explainLine('WHILE [#100 GT 0] DO1', lathe, en).map((w) => w.word)).toEqual(['WHILE', 'GT', '#100'])
  })

  it('has every text in the three languages and every interpreter function covered', () => {
    for (const [key, text] of Object.entries(HELP)) {
      expect(typeof text === 'object' && text['en'] && text['pt-BR'] && text['es'], key).toBeTruthy()
    }
    for (const c of [lathe, haas])
      for (const [code, e] of [...Object.entries(c.gCodes), ...Object.entries(c.mCodes)]) expect(HELP[`${code[0] === 'G' ? 'g' : 'm'}:${e.function}`], code).toBeDefined()
  })
})
