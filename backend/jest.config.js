/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  setupFiles: ['<rootDir>/__tests__/setup.js'],
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
  ],
  coverageReporters: ['text', 'lcov'],
  testTimeout: 15000,
  // uuid@13+ é ESM puro (transitivo via mercadopago) — redireciona para mock CJS
  moduleNameMapper: {
    '^mercadopago$': '<rootDir>/__tests__/__mocks__/mercadopago.js',
  },
  // CJS project — sem transform necessário
  transform: {},
}
