import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

/** Unit tests for pure TypeScript modules (no React Native runtime). */
export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
