import path from 'node:path'
import { expect, test } from '@playwright/test'

for (const detached of [false, true]) {
  test(`stream completion preserves ${detached ? 'reading position' : 'bottom position'}`, async ({ page }) => {
    await page.goto(`/@fs${path.resolve(process.cwd(), 'fixtures/conversation-stream-completion.html')}`)
    const scroll = page.locator('[data-conversation-scroll]')
    await expect(scroll).toBeVisible()
    await page.getByRole('button', { name: 'Start reply' }).click()
    await page.waitForTimeout(150)
    await page.getByRole('button', { name: 'Grow reply' }).click()
    await expect.poll(() => scroll.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(2)
    if (detached) {
      await scroll.hover()
      await page.mouse.wheel(0, -450)
      await expect.poll(() => scroll.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeGreaterThan(300)
    }
    const before = await scroll.evaluate(el => el.scrollTop)
    await page.getByRole('button', { name: 'Finish reply' }).click()
    // Wait for virtual rows to measure and all bottom-settle frames to run.
    await page.waitForTimeout(800)
    if (detached) {
      expect(Math.abs(await scroll.evaluate(el => el.scrollTop) - before)).toBeLessThan(2)
    } else {
      expect(await scroll.evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(2)
    }
    // An actual new prompt, even with the same text, must still align at the top.
    await page.getByRole('button', { name: 'Send again' }).click()
    const latest = page.getByText('Current prompt', { exact: true }).last()
    await expect.poll(() => latest.evaluate(el => el.getBoundingClientRect().top - el.closest('[data-conversation-scroll]')!.getBoundingClientRect().top)).toBeLessThan(100)
  })
}
