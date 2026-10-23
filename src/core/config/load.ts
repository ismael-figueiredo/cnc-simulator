import { z } from 'zod'
import {
  AlarmCatalogSchema,
  ControlSchema,
  MachineSchema,
  ToolLibrarySchema,
  type AlarmCatalog,
  type Control,
  type Machine,
  type ToolLibrary
} from './schema'

/** A problem found while loading a config file. The UI turns it into text in the chosen language. */
export interface ConfigIssue {
  kind: 'invalid-json' | 'schema'
  source: string
  /** Dotted path to the field, empty for the root. */
  path: string
  /** Validator message, already in the language set by setValidationLanguage. */
  message: string
}

export type LoadResult<T> = { ok: true; value: T } | { ok: false; issues: ConfigIssue[] }

const zodLocales = {
  en: () => z.locales.en(),
  'pt-BR': () => z.locales.ptBR(),
  es: () => z.locales.es()
} as const

/** Sets the language of schema validation messages ("en", "pt-BR" or "es"). */
export function setValidationLanguage(lang: string): void {
  const make = lang in zodLocales ? zodLocales[lang as keyof typeof zodLocales] : zodLocales.en
  z.config(make())
}

export function validate<T>(schema: z.ZodType<T>, data: unknown, source: string): LoadResult<T> {
  const r = schema.safeParse(data)
  if (r.success) return { ok: true, value: r.data }
  return {
    ok: false,
    issues: r.error.issues.map((i) => ({ kind: 'schema', source, path: i.path.join('.'), message: i.message }))
  }
}

/** Accepts an already parsed object or the JSON file text. */
export function parse(data: unknown, source: string): { ok: true; value: unknown } | { ok: false; issues: ConfigIssue[] } {
  if (typeof data !== 'string') return { ok: true, value: data }
  try {
    return { ok: true, value: JSON.parse(data) }
  } catch (e) {
    return { ok: false, issues: [{ kind: 'invalid-json', source, path: '', message: (e as Error).message }] }
  }
}

export function loadMachine(data: unknown, source = 'machine'): LoadResult<Machine> {
  const j = parse(data, source)
  return j.ok ? validate(MachineSchema, j.value, source) : j
}

export function loadControl(data: unknown, source = 'control'): LoadResult<Control> {
  const j = parse(data, source)
  return j.ok ? validate(ControlSchema, j.value, source) : j
}

export function loadToolLibrary(data: unknown, source = 'tools'): LoadResult<ToolLibrary> {
  const j = parse(data, source)
  return j.ok ? validate(ToolLibrarySchema, j.value, source) : j
}

export function loadAlarmCatalog(data: unknown, source = 'alarms'): LoadResult<AlarmCatalog> {
  const j = parse(data, source)
  return j.ok ? validate(AlarmCatalogSchema, j.value, source) : j
}
