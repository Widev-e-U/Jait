import { expect, test } from '@playwright/test'

test('month view fits a phone and shows selected day events', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.addInitScript(() => localStorage.setItem('jait-gateway-url', window.location.origin))
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), 15, 12).toISOString()
  await page.route('**/api/calendar/**', route => route.fulfill({ json: route.request().url().includes('/accounts')
    ? { accounts: [{ id: 'cal', provider: 'google', displayName: 'Calendar', email: 'test@example.com' }] }
    : { events: [{ id: 'event', calendarId: 'cal', calendarName: 'Calendar', title: 'An event with a long descriptive title', start, end: start, allDay: false }] } }))
  await page.goto('/src/e2e-fixtures/calendar-mobile.html')
  await page.getByRole('button', { name: 'Calendar', exact: true }).click()
  const day = page.getByRole('button', { name: /15, .*1 events/ })
  await expect(day).toBeVisible()
  await day.click()
  await expect(page.locator('p').getByText('An event with a long descriptive title')).toBeVisible()
  await expect(day).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
