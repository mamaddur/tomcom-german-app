/** Unit tests: no network, no database. */
module.exports = {
  preset: 'ts-jest',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/*.spec.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts'],
};
