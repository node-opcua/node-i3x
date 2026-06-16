import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    conditions: ['source'],
  },
  ssr: {
    resolve: {
      conditions: ['source'],
      externalConditions: ['source'],
    },
  },
  test: {
    include: ['packages/*/tests/**/*.test.ts'],
    globals: true,
    testTimeout: 15_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.d.ts',
        '**/index.ts',
        // Pure type / interface files (zero executable code)
        'packages/core/src/domain/**',
        'packages/core/src/types/**',
        'packages/core/src/ports/data-source.ts',
        'packages/opcua-connector/src/opcua-types.ts',
        // CLI entry points & demo apps (not library code)
        'packages/app/src/cli.ts',
        'packages/app/src/banner.ts',
        'packages/app/src/demo.ts',
        'packages/demo-embedded/src/**',
      ],
      all: true,
    },
  },
});
