import { expect, test } from '@playwright/test'

test('read notifications disappear from the center without a clear step', async ({ page }) => {
  await page.goto('/src/e2e-fixtures/notification-center.html')
  const controls = page.getByRole('button', { name: /^Show all notifications/ })
  await expect(controls).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Add notifications' }).click()
  await expect(page.getByRole('button', { name: 'Notifications, 2 unread', exact: true })).toBeVisible()
  await controls.click()
  await expect(page.getByRole('button', { name: 'Mark "First notification" as read' })).toBeVisible()

  await page.getByRole('button', { name: 'Mark "First notification" as read' }).click()
  await expect(page.getByRole('button', { name: 'Mark "First notification" as read' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Show all notifications, 1 unread' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Clear', exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Mark "Second notification" as read' }).click()
  await expect(controls).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Notifications', exact: true })).toBeVisible()
})
