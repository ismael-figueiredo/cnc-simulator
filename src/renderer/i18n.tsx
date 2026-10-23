import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { setValidationLanguage } from '@core/index'
import {
  DEFAULT_LANGUAGE,
  isLanguage,
  localize,
  resolveLanguage,
  translate,
  type Language,
  type LocalizedText,
  type MessageKey,
  type Params
} from '@i18n/index'

const STORAGE_KEY = 'cncsim.language'

interface I18n {
  lang: Language
  setLang: (lang: Language) => void
  t: (key: MessageKey, params?: Params) => string
  /** Picks the current language out of a config text ({ "en": ..., "pt-BR": ... }). */
  l: (text: LocalizedText | undefined) => string
}

const I18nContext = createContext<I18n | null>(null)

function storedLanguage(): Language {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v) return resolveLanguage(v)
  } catch {
    // storage blocked: fall back to the default
  }
  return DEFAULT_LANGUAGE
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(storedLanguage)

  // Validation messages must follow the language before the first render that validates.
  setValidationLanguage(lang)

  useEffect(() => {
    document.documentElement.lang = lang
    void window.api?.setLanguage(lang)
  }, [lang])

  const setLang = useCallback((next: Language) => {
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // not persisted; the choice still applies to this session
    }
  }, [])

  // Desktop: the language is picked in the native Language menu.
  useEffect(
    () =>
      window.api?.onLanguageChanged((next) => {
        if (isLanguage(next)) setLang(next)
      }),
    [setLang]
  )

  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      t: (key, params) => translate(lang, key, params),
      l: (text) => localize(text, lang)
    }),
    [lang, setLang]
  )
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>')
  return ctx
}
