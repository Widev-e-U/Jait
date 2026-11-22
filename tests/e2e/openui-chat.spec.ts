import { test, expect } from '@playwright/test'

test('renders streamed OpenUI, then supports local interactions', async ({ page }) => {
  await page.goto('/openui-chat.html')
  await expect(page.getByText('Status', { exact: true })).toBeVisible()
  await expect(page.getByText('Done', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Finish stream' }).click()
  await expect(page.getByText('After', { exact: true })).toBeVisible()
  await page.getByLabel('Review').check()
  await expect(page.getByLabel('Review')).toBeChecked()
  await page.getByText('Notes', { exact: true }).click()
  await expect(page.getByText('Ready to review', { exact: true })).toBeVisible()
  await page.getByText('OpenUI source').click()
  await expect(page.locator('pre')).toContainText('root = Panel')
})
