import { chromium } from '@playwright/test'

// Vite can serve HTML before its cold dependency graph is ready. Charge that
// startup work to one bounded setup step, not the first test's action deadline.
export default async function warmFrontend(config) {
  const baseURL = config.projects[0]?.use.baseURL
  if (!baseURL) throw new Error('E2E frontend baseURL is required')
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`))
    await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    // Cold Vite transforms can continue after DOMContentLoaded, especially on CI.
    try {
      await page.waitForFunction(() => Boolean(document.querySelector('#root')?.firstElementChild), undefined, { timeout: 60_000 })
    } catch (error) {
      if (errors.length) console.error('Frontend warm-up errors:', errors.join('\n'))
      throw error
    }
  } finally {
    await browser.close()
  }
}
