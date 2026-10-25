import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'

/**
 * Playwright configuration for Jait E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
// Isolated shards must never clean or overwrite another shard's evidence.
const artifactDir = process.env.JAIT_E2E_ARTIFACT_DIR || resolve(__dirname, '../../.jait/artifacts')
const configuredFrontendUrl = process.env.FRONTEND_URL
const configuredApiUrl = process.env.API_URL
const FRONTEND_URL = configuredFrontendUrl || `http://127.0.0.1:${process.env.E2E_FRONTEND_PORT || 3100}`
const API_URL = configuredApiUrl || (configuredFrontendUrl ? 'http://localhost:8000' : `http://127.0.0.1:${process.env.E2E_API_PORT || 8100}`)
const shouldStartLocalStack = !configuredFrontendUrl && !configuredApiUrl
const includeFullBrowserMatrix = process.env.PLAYWRIGHT_ALL_BROWSERS === '1'
const includeMobileMatrix = process.env.PLAYWRIGHT_MOBILE === '1'

process.env.API_URL = API_URL
process.env.FRONTEND_URL = FRONTEND_URL

export default defineConfig({
  testDir: '.',
  globalSetup: resolve(__dirname, 'scripts/warm-frontend.mjs'),
  outputDir: resolve(artifactDir, 'playwright-results'),

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* A failed local verification already blocks activation; stop after its retries. */
  maxFailures: process.env.JAIT_LOCAL_VERIFY_FAIL_FAST === '1' ? 1 : undefined,

  /* Keep local runs stable against a single shared dev stack. */
  workers: process.env.PLAYWRIGHT_WORKERS ? Number(process.env.PLAYWRIGHT_WORKERS) : 1,

  /* Reporter to use */
  reporter: [
    ['html', { outputFolder: resolve(artifactDir, 'playwright-report'), open: 'never' }],
    ['list']
  ],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like `await page.goto('/')` */
    baseURL: FRONTEND_URL,
    serviceWorkers: 'block',

    /* Keep a trace for local failures even when retries are disabled. */
    trace: 'retain-on-failure',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure for debugging */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    ...(includeFullBrowserMatrix
      ? [
          {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
          },
          {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
          },
        ]
      : []),

    ...(includeMobileMatrix
      ? [
          {
            name: 'mobile-chrome',
            use: { ...devices['Pixel 5'] },
          },
        ]
      : []),
  ],

  /* Run the gateway-owned dev stack before starting tests */
  webServer: shouldStartLocalStack
    ? {
        command: 'node ./scripts/start-dev-stack.mjs',
        url: FRONTEND_URL,
        // Containerised preview browsers reach loopback targets through
        // host.docker.internal, so Vite must not listen on 127.0.0.1 only.
        env: { E2E_WEB_HOST: '0.0.0.0' },
        reuseExistingServer: false,
        gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
        timeout: 120000,
      }
    : undefined,
})
