import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { I18nProvider } from '../../src/renderer/i18n'
import { PlatformProvider } from '../../src/renderer/platform'
import { browserPlatform } from '../../src/renderer/platform/browser'
import { createStore } from '../../src/renderer/platform/storage'

/** Renders a component the way the app does: browser platform (in-memory storage), UI in English. */
export function renderApp(ui: ReactNode) {
  // The UI language is a preference in the window's own storage
  localStorage.setItem('cncsim.language', 'en')
  const data = new Map<string, string>()
  const store = createStore(() => ({ getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }))
  const platform = browserPlatform({ store, download: () => undefined, pickFile: () => Promise.resolve(null) })
  return render(
    <PlatformProvider platform={platform}>
      <I18nProvider>{ui}</I18nProvider>
    </PlatformProvider>
  )
}
