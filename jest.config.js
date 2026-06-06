/** @type {import('jest').Config} */
module.exports = {
  testEnvironment:  "node",
  globalSetup:      "./tests/globalSetup.js",
  globalTeardown:   "./tests/globalTeardown.js",
  testMatch:        ["**/tests/**/*.test.js"],
  testTimeout:      20000,
  verbose:          true,
  maxWorkers:       1,
  setupFiles:       ["./tests/jest.env.js"],
};
