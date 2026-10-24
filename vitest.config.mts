import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The sprocket tests simulate whole macro programs (thousands of moves); on a busy machine they
    // can take several seconds, so the 5 s default makes them fail for the wrong reason
    testTimeout: 30_000
  }
})
