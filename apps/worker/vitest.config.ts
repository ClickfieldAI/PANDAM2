import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Registering a user runs the real PBKDF2 (210k iterations) on purpose, so
    // tests that create dozens of accounts are CPU-bound. The default 5 s limit
    // made them intermittently fail on a busy machine; they are not hanging.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
