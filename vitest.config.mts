import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Same aliases as the app (electron.vite.config.ts), for renderer modules under test
  resolve: { alias: { '@core': resolve('src/core'), '@i18n': resolve('src/i18n') } },
  test: {
    // The sprocket tests simulate whole macro programs (thousands of moves); on a busy machine they
    // can take several seconds, so the 5 s default makes them fail for the wrong reason
    testTimeout: 30_000
  }
})
