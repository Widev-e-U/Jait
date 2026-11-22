import { test, expect } from '@playwright/test'

test('keeps the child status visible after the spawn operation completes', async ({ page }) => {
  await page.goto('/codex-agent-fixture.html')
  await expect(page.getByText('Inspect the project').first()).toBeVisible()
  await page.getByRole('button', { name: 'Finish spawn operation' }).click()
  await expect(page.getByText('Agent child-1')).toBeVisible()
  await expect(page.getByText('last reported: running')).toBeVisible()
  await expect(page.getByText('Inspecting files')).toBeVisible()
  await expect(page.getByTestId('usage-receipt')).toContainText('60 cache reads')
  await expect(page.getByTestId('usage-receipt')).toContainText('20 cache writes')
  await expect(page.getByTestId('usage-receipt')).toContainText('0.01 USD estimated from configured rates')
})
