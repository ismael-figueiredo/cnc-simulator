import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { I18nProvider } from './i18n'
import { detectPlatform, PlatformProvider } from './platform'
import '@fontsource/share-tech-mono/latin-400.css'
import '@fontsource/barlow-condensed/latin-600.css'
import '@fontsource/barlow-condensed/latin-700.css'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('#root element not found')

createRoot(root).render(
  <StrictMode>
    <PlatformProvider platform={detectPlatform()}>
      <I18nProvider>
        <App />
      </I18nProvider>
    </PlatformProvider>
  </StrictMode>
)
