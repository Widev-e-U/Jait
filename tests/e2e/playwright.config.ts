import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for Jait E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3100'
const shouldStartLocalStack = !process.env.FRONTEND_URL
const includeFullBrowserMatrix = process.env.PLAYWRIGHT_ALL_BROWSERS === '1'
const includeMobileMatrix = process.env.PLAYWRIGHT_MOBILE === '1'

export default defineConfig({
  testDir: '.',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Keep local runs stable against a single shared dev stack. */
  workers: process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : 1,

  /* Reporter to use */
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list']
  ],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: FRONTEND_URL,

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure for debugging */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    /* Setup project to seed auth state */
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },

    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },

    ...(includeFullBrowserMatrix
      ? [
          {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
            dependencies: ['setup'],
          },
          {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
            dependencies: ['setup'],
          },
        ]
      : []),

    ...(includeMobileMatrix
      ? [
          {
            name: 'mobile-chrome',
            use: { ...devices['Pixel 5'] },
            dependencies: ['setup'],
          },
        ]
      : []),
  ],

  /* Run the gateway-owned dev stack before starting tests */
  webServer: shouldStartLocalStack
    ? {
        command: 'node ./scripts/start-dev-stack.mjs',
        url: FRONTEND_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      }
    : undefined,
})
