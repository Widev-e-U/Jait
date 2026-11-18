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


test('question wait retries update one pending card in streams and replay', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/src/e2e-fixtures/index.html')
  await page.evaluate(() => import('/src/e2e-fixtures/question-waits.tsx'))
  const regions = ['Streamed question', 'Replayed question'].map(name => page.getByRole('region', { name }))
  for (const region of regions) {
    await expect(region.getByText(/^Waiting for your answer:/)).toHaveCount(1)
    await expect(region.getByText('Publish prepared fix', { exact: true })).toHaveCount(1)
  }
  await page.getByRole('button', { name: 'Resume six waits' }).click()
  for (const region of regions) {
    await expect(region.getByText(/^Waiting for your answer:/)).toHaveCount(1)
    await expect(region.getByText(/^Question answered:/)).toHaveCount(0)
  }
  await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/question-waits-pending.png'), fullPage: true })
  await page.getByRole('button', { name: 'Answer question' }).click()
  for (const region of regions) {
    await expect(region.getByText(/^Question answered:/)).toHaveCount(1)
    await expect(region.getByText('Waiting for your answers', { exact: true })).toHaveCount(0)
    // The original question and answer remain visible on the completed card.
    await expect(region.getByText('Push the prepared fix?', { exact: true })).toBeVisible()
    await expect(region.getByText('Yes, push the fix', { exact: true })).toBeVisible()
  }
  await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/question-waits-answered.png'), fullPage: true })
})
