module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    // The Lambda handlers are ESM .mjs; swc compiles them for the test runner.
    '^.+\\.(t|j|mj)sx?$': ['@swc/jest'],
  },
  moduleFileExtensions: ['ts', 'tsx', 'mjs', 'js', 'json'],
  transformIgnorePatterns: [],
};
