import { expect, test } from '@playwright/test'

test('refreshing projects does not restore the originally linked chat after selection', async ({ page }) => {
  await page.goto('/src/e2e-fixtures/index.html?projectId=project&sessionId=loop')
  await page.evaluate(() => import('/src/e2e-fixtures/project-selection-refresh.tsx'))
  const selection = page.getByTestId('selection')
  await expect(selection).toHaveText('loop')
  await page.getByRole('button', { name: 'Select other' }).click()
  await expect(selection).toHaveText('other')
  await page.getByRole('button', { name: 'Refresh projects' }).click()
  await expect(page.getByTestId('refreshes')).toHaveText('1')
  await expect(selection).toHaveText('other')
})
