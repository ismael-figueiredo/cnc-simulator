// Lint rules for the whole project. Run with `npm run lint` (or `npm run check` for types + lint + tests).
import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  globalIgnores(['out/', 'dist/', 'node_modules/', 'docs/legacy/']),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname }
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Template strings with numbers are fine for UI text and diagnostics
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Interpreter code checks values that are defined by construction; keep the checks readable
      '@typescript-eslint/no-unnecessary-condition': ['error', { allowConstantLoopConditions: true }],
      // `onClick={() => setValue(x)}` is the normal React style
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      // Interfaces declare callbacks as properties (`fn: () => void`), so methods are never unbound
      '@typescript-eslint/method-signature-style': ['error', 'property'],
      eqeqeq: ['error', 'always'],
      'no-console': ['warn', { allow: ['warn', 'error'] }]
    }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser }
  },
  {
    files: ['src/main/**', 'src/preload/**', 'src/server/**', 'tests/**', 'scripts/**', '*.config.*'],
    languageOptions: { globals: globals.node }
  },
  {
    files: ['**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked]
  }
)
