import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/tests/**/*.test.ts'],
    globals: true,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
