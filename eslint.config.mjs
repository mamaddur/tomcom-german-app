// Shared flat config. Next.js app extends its own config in apps/web.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/node_modules/**',
      'apps/mobile/**',
      'apps/web/**',
      'packages/api-client-ts/src/schema.d.ts',
      'apps/api/src/generated/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
    rules: {
      // NFR-09: console output bypasses the PII-redacting logger.
      'no-console': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['tools/**', 'scripts/**', '**/*.config.*'],
    rules: { 'no-console': 'off' },
  },
);
