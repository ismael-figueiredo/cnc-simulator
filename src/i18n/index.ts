// Shared by the renderer, the Electron main process and the server. No DOM, no Electron.
import { en, type MessageKey } from './locales/en'
// en.ts is the source; every catalog has every key (enforced by Record<MessageKey, string>)
import { es } from './locales/es'
import { ptBR } from './locales/pt-BR'

export type { MessageKey }

export const LANGUAGES = [
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' }
] as const

export type Language = (typeof LANGUAGES)[number]['code']
export const DEFAULT_LANGUAGE: Language = 'pt-BR'

export type Params = Record<string, string | number>

const catalogs: Record<Language, Record<MessageKey, string>> = { en, 'pt-BR': ptBR, es }

export function isLanguage(v: unknown): v is Language {
  return LANGUAGES.some((l) => l.code === v)
}

/** Maps "pt", "pt-PT", "es-AR", "en-US"… to a supported language, or the default. */
export function resolveLanguage(v: string | null | undefined): Language {
  if (!v) return DEFAULT_LANGUAGE
  if (isLanguage(v)) return v
  const base = v.toLowerCase().split(/[-_]/)[0]
  const hit = LANGUAGES.find((l) => l.code.toLowerCase().split('-')[0] === base)
  return hit ? hit.code : DEFAULT_LANGUAGE
}

export function translate(lang: Language, key: MessageKey, params?: Params): string {
  const text = catalogs[lang][key]
  if (!params) return text
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m))
}

/** Text in config files: a plain string, or one string per language ({ "en": "...", "pt-BR": "..." }). */
export type LocalizedText = string | Partial<Record<string, string>>

export function localize(text: LocalizedText | undefined, lang: Language): string {
  if (text === undefined) return ''
  if (typeof text === 'string') return text
  return text[lang] ?? text['en'] ?? Object.values(text).find((v) => v !== undefined) ?? ''
}
