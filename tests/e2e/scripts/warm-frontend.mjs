import { chromium } from '@playwright/test'

// Vite can serve HTML before its cold dependency graph is ready. Charge that
// startup work to one bounded setup step, not the first test's action deadline.
export default async function warmFrontend(config) {
  const baseURL = config.projects[0]?.use.baseURL
  if (!baseURL) throw new Error('E2E frontend baseURL is required')
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(baseURL, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    await page.waitForFunction(() => Boolean(document.querySelector('#root')?.firstElementChild), undefined, { timeout: 10_000 })
  } finally {
    await browser.close()
  }
}
