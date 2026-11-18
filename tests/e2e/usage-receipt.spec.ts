import { test, expect } from '@playwright/test'

test.describe('model spending transparency', () => {
  test('receipts show real cached/uncached splits and honest provider-reported vs estimated labels', async ({ page }) => {
    await page.goto('/usage-receipt-repro.html')
    await expect(page.getByRole('heading', { name: 'Usage Receipt Repro' })).toBeVisible()

    // Provider-reported totals: request count, input, cache split, output.
    const reported = page.getByTestId('receipt-reported')
    await expect(reported).toContainText('34 requests')
    await expect(reported).toContainText('96,628,749 input')
    await expect(reported).toContainText('72,075,637 cached / 24,553,112 uncached')
    await expect(reported).toContainText('40,676,562 output')
    await expect(reported).toContainText('provider reported')
    await expect(reported).not.toContainText('estimated')

    // Estimated usage is labeled as such and never claims provider accounting.
    const estimated = page.getByTestId('receipt-estimated')
    await expect(estimated).toContainText('1,200 input')
    await expect(estimated).toContainText('cache usage unavailable')
    await expect(estimated).toContainText('80 output')
    await expect(estimated).toContainText('estimated')
    await expect(estimated).not.toContainText('provider reported')

    // Unknown cache stays explicit rather than being reported as zero.
    const noCache = page.getByTestId('receipt-no-cache')
    await expect(noCache).toContainText('500 input')
    await expect(noCache).toContainText('cache usage unavailable')
    await expect(noCache).not.toContainText('0 cached')
    await expect(noCache).toContainText('provider reported')

    // Session aggregation sums provider-reported and estimated rounds and
    // flags that at least one contributor was estimated.
    const session = page.getByTestId('session-metrics')
    await expect(session).toContainText('prompt tokens: 96629949')
    await expect(session).toContainText('completion tokens: 40676642')
    await expect(session).toContainText('total duration ms: 121000')
    await expect(session).toContainText('assistant turns: 2')
    await expect(session).toContainText('estimated: true')
  })
})
