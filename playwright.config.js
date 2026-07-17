// @see https://playwright.dev/docs/test-configuration
const config = {
  testDir: './tests',
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  // Run tests sequentially against the local server
  workers: 1,
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,
  // Opt out of parallel tests on CI
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // Run local dev server before starting tests
  webServer: {
    command: 'npm start',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
};

module.exports = config;