/** Integration tests: need Postgres and Redis from scripts/dev-services.sh. */
module.exports = {
  preset: 'ts-jest',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.int-spec.ts'],
};
