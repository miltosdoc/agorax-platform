import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    // Threshold key ceremonies and full election e2e do real modular
    // exponentiation over large groups — a few seconds each locally, more
    // on a contended CI runner. The default 5s timeout flakes; give the
    // crypto room to finish deterministically.
    testTimeout: 30000,
  },
});
