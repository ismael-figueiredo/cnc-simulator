import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // Same aliases as the app (electron.vite.config.ts), for renderer modules under test
  resolve: { alias: { '@core': resolve('src/core'), '@i18n': resolve('src/i18n') } },
  test: {
    // The sprocket tests simulate whole macro programs (thousands of moves); on a busy machine they
    // can take several seconds, so the 5 s default makes them fail for the wrong reason
    testTimeout: 30_000,
    projects: [
      { extends: true, test: { name: 'node', include: ['tests/**/*.test.ts'], environment: 'node' } },
      // React components, rendered in a simulated DOM
      { extends: true, test: { name: 'dom', include: ['tests/**/*.test.tsx'], environment: 'jsdom' } }
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts'],
      reporter: ['text-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      // A floor just under today's numbers: coverage can only go up. Raise them as tests are added.
      thresholds: {
        statements: 49,
        branches: 45,
        functions: 31,
        lines: 50,
        'src/core/**': { statements: 89, branches: 80, functions: 94, lines: 91 },
        'src/renderer/geometry/**': { statements: 95, branches: 74, functions: 90, lines: 99 }
      }
    }
  }
})
