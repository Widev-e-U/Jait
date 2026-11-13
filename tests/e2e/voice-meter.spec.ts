import { expect, test } from '@playwright/test'

for (const variant of ['assistant', 'messenger']) {
  test(`recording meter has visible bars on mobile in ${variant}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await page.goto(`/src/e2e-fixtures/index.html${variant === 'messenger' ? '?messenger' : ''}`)
    await page.evaluate(() => import('/src/e2e-fixtures/voice-meter.tsx'))
    const stop = page.getByRole('button', { name: 'Finish dictation' })
    await expect(stop).toBeVisible()
    const meter = stop.locator('..').locator('span').filter({ has: page.locator('span[style*="height"]') }).last()
    await expect(meter).toBeVisible()
    const bars = meter.locator('span[style*="height"]')
    expect(await bars.count()).toBeGreaterThan(1)
    const first = await bars.first().boundingBox()
    expect(first!.width).toBeGreaterThanOrEqual(2)
    await expect(bars.first()).toHaveCSS('height', '1px')
    await expect.poll(async () => Number.parseFloat(await bars.last().evaluate(node => (node as HTMLElement).style.height))).toBeGreaterThan(2)
    await expect(bars.first()).toHaveCSS('height', '1px')
    await expect(stop.locator('..').locator('.animate-pulse')).toHaveCount(0)
    const box = (await meter.boundingBox())!
    expect(box.width).toBeGreaterThan(80)
    expect(box.x + box.width).toBeLessThanOrEqual(320)
  })
}
