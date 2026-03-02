import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: ['**/src/**/*.ts', '!**/node_modules/**', '!**/dist/**'],
  moduleNameMapper: {
    '^@govli/shared/(.*)$': '<rootDir>/shared/src/$1',
    '^@govli/ui/(.*)$': '<rootDir>/govli-ui/src/$1',
  },
};

export default config;
