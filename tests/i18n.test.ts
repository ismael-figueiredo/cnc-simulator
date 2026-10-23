import { describe, expect, it } from 'vitest'
import { DIAGNOSTIC_CODES } from '../src/core'
import { localize, resolveLanguage, translate } from '../src/i18n'
import { en } from '../src/i18n/locales/en'
import { es } from '../src/i18n/locales/es'
import { ptBR } from '../src/i18n/locales/pt-BR'

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('i18n', () => {
  it.each([['pt-BR', ptBR], ['es', es]] as const)('%s has the same keys as en', (_lang, catalog) => {
    expect(Object.keys(catalog).sort()).toEqual(Object.keys(en).sort())
  })

  it.each([['pt-BR', ptBR], ['es', es]] as const)('%s keeps every {placeholder} of en', (_lang, catalog) => {
    for (const [k, v] of Object.entries(en)) expect([k, placeholders(catalog[k as keyof typeof en])]).toEqual([k, placeholders(v)])
  })

  it('has a text for every interpreter diagnostic', () => {
    const missing = DIAGNOSTIC_CODES.filter((c) => !(`diag.${c}` in en))
    expect(missing).toEqual([])
  })

  it('fills parameters', () => {
    expect(translate('pt-BR', 'program.lines', { count: 130 })).toBe('130 linhas')
    expect(translate('es', 'program.lines', { count: 130 })).toBe('130 líneas')
  })

  it('resolves system locales to a supported language', () => {
    expect(resolveLanguage('pt')).toBe('pt-BR')
    expect(resolveLanguage('es-AR')).toBe('es')
    expect(resolveLanguage('en-US')).toBe('en')
    expect(resolveLanguage('de-DE')).toBe('pt-BR')
  })

  it('picks localized config text with English fallback', () => {
    const name = { en: 'Live tool', 'pt-BR': 'Ferramenta acionada' }
    expect(localize(name, 'pt-BR')).toBe('Ferramenta acionada')
    expect(localize(name, 'es')).toBe('Live tool')
    expect(localize('Romi GL 250 M', 'es')).toBe('Romi GL 250 M')
  })
})
