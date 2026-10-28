import path from 'node:path'
import { expect, test } from '@playwright/test'

for (const width of [390, 1280]) {
  test(`prepares usage before opening and pauses while hidden at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    let liveRequests = 0
    let snapshotRequests = 0
    let percent = 0.42
    await page.route('**/api/provider-usage/summary*', route => {
      const cached = new URL(route.request().url()).searchParams.get('refresh') === '0'
      if (cached) snapshotRequests += 1
      else liveRequests += 1
      return route.fulfill({ json: { generatedAt: new Date().toISOString(), profiles: [{
        id: 'codex', providerType: 'codex', providerLabel: 'Codex', profileLabel: 'Personal',
        locationLabel: 'Gateway profile', error: null,
        quotas: [{ accountId: 'codex', providerType: 'codex', rateLimitType: 'five_hour',
          utilization: cached ? 0.1 : percent, updatedAt: new Date().toISOString(), models: [], credits: null }],
      }] } })
    })
    await page.goto('/src/e2e-fixtures/index.html')
    await page.clock.install()
    await page.evaluate(() => import('/src/e2e-fixtures/usage-prefetch.tsx'))
    await expect.poll(() => liveRequests).toBe(1)
    expect(snapshotRequests).toBe(1)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: 'Show usage' }).click()
    await expect(page.getByText('42% used', { exact: true })).toBeVisible()
    await expect(page.getByTestId('usage-modal-loading')).toHaveCount(0)
    expect(liveRequests).toBe(1)
    await page.screenshot({ path: path.resolve(__dirname, `../../.jait/shots/usage-prefetched-${width}.png`) })
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    percent = 0.51
    await page.clock.runFor(6 * 60_000)
    expect(liveRequests).toBe(1)
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await expect.poll(() => liveRequests).toBe(2)
    await page.getByRole('button', { name: 'Show usage' }).click()
    await expect(page.getByText('51% used', { exact: true })).toBeVisible()
    expect(liveRequests).toBe(2)
    // One scheduled refresh while active, then no work after ten idle minutes.
    await page.clock.runFor(11 * 60_000)
    await expect.poll(() => liveRequests).toBe(3)
    await page.clock.runFor(10 * 60_000)
    expect(liveRequests).toBe(3)
    await page.locator('body').dispatchEvent('pointerdown', { bubbles: true })
    await expect.poll(() => liveRequests).toBe(4)
  })
}
