import path from 'node:path'
import { expect, test } from '@playwright/test'

for (const width of [1280, 320]) {
  test(`voice controls are usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/src/e2e-fixtures/index.html')
    await page.evaluate(() => import('/src/e2e-fixtures/voice-controls.tsx'))
    const wake = page.getByRole('button', { name: 'Enable wake word' })
    await wake.click()
    await expect(page.getByRole('button', { name: 'Disable wake word' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Start voice conversation' }).click()
    await expect(page.getByRole('status')).toContainText('Listening')
    const active = page.getByRole('status')
    const box = (await active.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
    await page.getByRole('button', { name: 'Mute microphone' }).click()
    await expect(active).toContainText('Mic muted')
    await page.getByRole('button', { name: 'Unmute microphone' }).click()
    await page.getByRole('button', { name: 'Simulate thinking' }).click()
    await expect(active).toContainText('Thinking')
    await page.getByRole('button', { name: 'Simulate speaking' }).click()
    await expect(active).toContainText('Speaking')
    await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/', `voice-controls-${width}.png`) })
    await page.getByRole('button', { name: 'End voice conversation' }).click()
    await expect(page.getByRole('button', { name: 'Start voice conversation' })).toBeVisible()
  })
}
