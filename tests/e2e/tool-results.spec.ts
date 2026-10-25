import path from 'node:path'
import { expect, test } from '@playwright/test'

test('tool cards show readable names and display completed MCP answers and cancellation', async ({ page }) => {
  await page.goto('/src/e2e-fixtures/index.html')
  await page.evaluate(() => import('/src/e2e-fixtures/tool-results.tsx'))
  await expect(page.getByText('Context Read', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('Waiting for your answers')).toBeVisible()
  await page.getByRole('button', { name: 'Show answered result' }).click()
  const answers = page.getByRole('definition').filter({ hasText: 'Homelab' })
  await expect(answers).toContainText('Local')
  await expect(answers).toContainText('Only the lab')
  await expect(page.getByText('Skipped', { exact: true })).toBeVisible()
  await expect(page.getByText('Where should it run?', { exact: true })).toBeVisible()
  await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/tool-results-answers.png'), fullPage: true })
  await page.getByRole('button', { name: 'Cancel question' }).click()
  await expect(page.getByText('The user cancelled the question request.', { exact: true })).toBeVisible()
  await expect(page.getByText('Homelab', { exact: true })).toHaveCount(0)
})
