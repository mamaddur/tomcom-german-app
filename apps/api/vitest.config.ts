import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC keeps decorator metadata, which NestJS dependency injection needs.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    setupFiles: ['test/setup-env.ts'],
    projects: [
      {
        extends: true,
        // Unit tests: no network, no database.
        test: { name: 'unit', include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'] },
      },
      {
        extends: true,
        // Integration tests: need Postgres and Redis from scripts/dev-services.sh.
        test: { name: 'integration', include: ['test/**/*.int-spec.ts'], fileParallelism: false },
      },
    ],
  },
});
