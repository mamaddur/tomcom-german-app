import { defineConfig } from 'vitest/config';

// Browser tests against running API + web servers (scripts/e2e-web.sh).
export default defineConfig({
  test: {
    include: ['e2e/**/*.e2e.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    sequence: { concurrent: false },
  },
});
