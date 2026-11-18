import path from 'node:path'
import { expect, test } from '@playwright/test'

test.use({ screenshot: 'off' })

const fixture = `/@fs${path.resolve(__dirname, 'fixtures/conversation-edit-scroll.html')}`

test('repeated downward wheel gestures stay still at the bottom', async ({ page }) => {
  await page.goto(fixture)
  const scroll = page.locator('[data-conversation-scroll]')
  const distance = () => scroll.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)
  await expect.poll(distance).toBeLessThan(1)
  await expect(scroll).toHaveCSS('visibility', 'visible')
  // contain stops scroll chaining but still permits the native boundary bounce.
  await expect(scroll).toHaveCSS('overscroll-behavior-y', 'none')
  await scroll.hover()
  const initialTop = await scroll.evaluate(el => el.scrollTop)
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 120)
    expect(await scroll.evaluate(el => el.scrollTop)).toBeCloseTo(initialTop, 0)
  }
  await page.mouse.wheel(0, -240)
  await expect.poll(distance).toBeGreaterThan(100)
  const readingTop = await scroll.evaluate(el => el.scrollTop)
  const height = await scroll.evaluate(el => el.scrollHeight)
  await page.getByRole('button', { name: 'Grow latest reply' }).click()
  await expect.poll(() => scroll.evaluate(el => el.scrollHeight)).toBeGreaterThan(height + 100)
  expect(await scroll.evaluate(el => el.scrollTop)).toBeCloseTo(readingTop, 0)
  await expect.poll(distance).toBeGreaterThan(200)
})

test('returning from bottom overscroll keeps following new output', async ({ page }) => {
  await page.goto(fixture)
  const scroll = page.locator('[data-conversation-scroll]')
  const distance = () => scroll.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)
  await expect(scroll).toHaveCSS('visibility', 'visible')
  await expect.poll(distance).toBeLessThan(1)
  await scroll.evaluate(el => {
    // Safari can report scrollTop beyond the maximum during elastic scrolling.
    // Reproduce the rebound without relying on platform-specific browser UI.
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true }))
    const max = el.scrollHeight - el.clientHeight
    Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => max + 8 })
    el.dispatchEvent(new Event('scroll'))
    delete (el as Partial<HTMLElement>).scrollTop
    el.dispatchEvent(new Event('scroll'))
  })
  const height = await scroll.evaluate(el => el.scrollHeight)
  await page.getByRole('button', { name: 'Grow latest reply' }).click()
  await expect.poll(() => scroll.evaluate(el => el.scrollHeight)).toBeGreaterThan(height + 100)
  await expect.poll(distance).toBeLessThan(1)
})
