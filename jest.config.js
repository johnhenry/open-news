export default {
  testEnvironment: 'node',
  transform: {},
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  globalSetup: '<rootDir>/tests/helpers/global-setup.js',
  setupFiles: ['<rootDir>/tests/helpers/env.js'],
  testTimeout: 20000,
  silent: true
};
