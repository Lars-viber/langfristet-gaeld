import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/stress/**/*.stress.ts'],
    testTimeout: 3_600_000,
  },
});
