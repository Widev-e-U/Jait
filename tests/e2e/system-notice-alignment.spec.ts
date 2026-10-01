import { expect, test } from '@playwright/test'

for (const width of [1280, 390]) {
  test(`background terminal notices align with user messages at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => import('/src/e2e-fixtures/system-notice-alignment.tsx'))

    const shortNotice = page.getByText('Background terminal completed (exit code 0).', { exact: true })
    const longNotice = page.getByText(/^Background terminal completed: /)
    await expect(shortNotice).toBeVisible()
    await expect(longNotice).toHaveCSS('text-align', 'right')

    const userRow = await page.locator('[data-message-from="user"]').first().boundingBox()
    expect(userRow).not.toBeNull()
    for (const notice of [shortNotice, longNotice]) {
      const box = await notice.boundingBox()
      expect(box).not.toBeNull()
      expect(Math.abs(box!.x + box!.width - (userRow!.x + userRow!.width))).toBeLessThan(1)
      expect(box!.width).toBeLessThanOrEqual(userRow!.width * 0.85 + 1)
    }
    const lineHeight = await longNotice.evaluate((element) => parseFloat(getComputedStyle(element).lineHeight))
    expect((await longNotice.boundingBox())!.height).toBeGreaterThan(lineHeight * 2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  })
}
