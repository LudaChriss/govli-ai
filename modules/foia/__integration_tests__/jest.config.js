module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__integration_tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  collectCoverageFrom: [
    '../**/*.ts',
    '!../**/*.d.ts',
    '!../**/__tests__/**',
    '!../**/__integration_tests__/**',
    '!../**/node_modules/**',
    '!../**/dist/**'
  ],
  coverageDirectory: './coverage',
  coverageReporters: ['html', 'text', 'lcov'],
  coverageThreshold: {
    global: {
      branches: 75,
      functions: 75,
      lines: 75,
      statements: 75
    }
  },
  verbose: true,
  testTimeout: 30000
};
