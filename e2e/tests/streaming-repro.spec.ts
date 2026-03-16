import { test, expect } from '@playwright/test'

test.describe('streaming tool interleave repro', () => {
  test('continues advancing trailing text during tool output churn', async ({ page }) => {
    await page.goto('/streaming-repro.html')

    await expect(page.getByRole('heading', { name: 'Streaming Reproduction' })).toBeVisible()
    await expect(page.getByTestId('phase')).toHaveText('tool-churn', { timeout: 5000 })

    const before = Number(await page.getByTestId('suffix-length').textContent())
    await page.waitForTimeout(500)
    const after = Number(await page.getByTestId('suffix-length').textContent())

    expect(after).toBeGreaterThan(before + 40)
    await expect(page.getByTestId('phase')).toHaveText('done', { timeout: 5000 })
  })
})
