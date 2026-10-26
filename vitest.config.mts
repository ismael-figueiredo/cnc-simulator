import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Same aliases as the app (electron.vite.config.ts), for renderer modules under test
  resolve: { alias: { '@core': resolve('src/core'), '@i18n': resolve('src/i18n') } },
  test: {
    // The sprocket tests simulate whole macro programs (thousands of moves); on a busy machine they
    // can take several seconds, so the 5 s default makes them fail for the wrong reason
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      // A floor just under today's numbers: coverage can only go up. Raise them as tests are added.
      thresholds: {
        statements: 43,
        branches: 40,
        functions: 23,
        lines: 44,
        'src/core/**': { statements: 88, branches: 79, functions: 93, lines: 90 }
      }
    }
  }
})
