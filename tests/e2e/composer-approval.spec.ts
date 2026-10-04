import { expect, test } from '@playwright/test'

for (const width of [390, 900, 1280]) {
  test(`auto-approval stays immediately right of History at ${width}px`, async ({ page }) => {
    const compact = width === 390
    await page.setViewportSize({ width, height: 800 })
    await page.goto(compact ? '/?compact' : '/', { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => import('/src/e2e-fixtures/composer-approval.tsx'))
    const history = page.getByRole('button', { name: 'History', exact: true })
    const approval = page.getByRole('button', { name: 'Auto-approved. Clear approve all' })
    await expect(history).toBeVisible()
    await expect(approval).toBeVisible()
    const historyBox = await history.boundingBox()
    const approvalBox = await approval.boundingBox()
    expect(Math.abs(approvalBox!.y + approvalBox!.height / 2 - historyBox!.y - historyBox!.height / 2)).toBeLessThan(2)
    expect(approvalBox!.x).toBeGreaterThanOrEqual(historyBox!.x + historyBox!.width)
    expect(approvalBox!.x - historyBox!.x - historyBox!.width).toBeLessThan(12)
    await expect(approval.locator('svg')).toBeVisible()
    if (!compact) await expect(approval).toHaveText('Auto-approved')
    await page.screenshot({ path: test.info().outputPath('composer-approval.png') })
    await approval.click()
    await expect(approval).toHaveCount(0)
    await expect(history).toBeVisible()
  })
}
