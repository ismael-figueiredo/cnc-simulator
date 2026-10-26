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
import { storage, usePlatform } from './platform'

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
  const v = storage.get(STORAGE_KEY)
  return v ? resolveLanguage(v) : DEFAULT_LANGUAGE
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const platform = usePlatform()
  const [lang, setLangState] = useState<Language>(storedLanguage)

  // Validation messages must follow the language before the first render that validates.
  setValidationLanguage(lang)

  useEffect(() => {
    document.documentElement.lang = lang
    platform.setLanguage(lang)
  }, [platform, lang])

  const setLang = useCallback((next: Language) => {
    setLangState(next)
    storage.set(STORAGE_KEY, next)
  }, [])

  // Desktop: the language is picked in the native Language menu.
  useEffect(
    () =>
      platform.onLanguageChanged((next) => {
        if (isLanguage(next)) setLang(next)
      }),
    [platform, setLang]
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
