/** Memorium — Jest config
 * Uses mongodb-memory-server so tests never hit Atlas.
 * NODE_ENV=test and JWT_SECRET are set in tests/env.setup.js before app import.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  setupFiles: ['<rootDir>/tests/env.setup.js'],
  testTimeout: 30000,
  verbose: true,
  collectCoverageFrom: [
    'controllers/**/*.js',
    'middleware/**/*.js',
    'models/**/*.js',
    'routes/**/*.js',
    'config/**/*.js',
    'utils/**/*.js',
    'storage/**/*.js',
    'server.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    global: {
      lines: 70,
      functions: 60,
      branches: 55,
      statements: 70,
    },
  },
};
