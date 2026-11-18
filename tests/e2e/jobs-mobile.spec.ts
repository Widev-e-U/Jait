import { expect, test } from '@playwright/test'

for (const width of [320, 390]) {
  test(`jobs fit and controls work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.addInitScript(() => localStorage.setItem('jait-gateway-url', window.location.origin))
    const job = { id: 'test', name: 'A very long scheduled job name for checking mobile layouts', cron_expression: '0 * * * *', job_type: 'system_job', enabled: true, prompt: null, provider: null, model: null }
    await page.route('**/api/jobs**', async route => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/runs')) return route.fulfill({ json: [] })
      if (url.pathname.endsWith('/test') && route.request().method() === 'PATCH') {
        Object.assign(job, route.request().postDataJSON())
        return route.fulfill({ json: job })
      }
      return route.fulfill({ json: { items: [job], total: 1, page: 1, size: 20 } })
    })
    await page.goto('/src/e2e-fixtures/jobs-mobile.html')
    const row = page.getByTestId('job-row-test')
    await expect(row).toBeVisible()
    await expect(row.getByText(job.cron_expression)).toBeVisible()
    await expect(row.getByText(/Next run/)).toBeVisible()
    await expect(row.getByRole('button', { name: /Run job/ })).toBeVisible()
    await expect(row.getByRole('button', { name: /View history/ })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(await row.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await row.getByRole('switch').click()
    await expect(row.getByRole('switch')).not.toBeChecked()
    await expect(row.getByRole('button', { name: /Run job/ })).toBeDisabled()
  })
}
