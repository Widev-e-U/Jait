import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

test.use({ viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true })
async function openChat(page: Page) {
  await page.goto(`/@fs${path.resolve(process.cwd(), 'fixtures/mobile-follow-up.html')}`)
  const scroll = page.locator('[data-conversation-scroll]')
  await expect(scroll).toBeVisible()
  await expect.poll(() => scroll.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(2)
  // Follow-ups must also work while reading older messages.
  await scroll.evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 })) })
}
async function expectClearHeader(page: Page, id: string) {
  const message = page.getByTestId(id)
  await expect(message).toBeVisible()
  await expect.poll(async () => {
    const messageBox = await message.boundingBox()
    const headerBox = await page.getByTestId('header').boundingBox()
    return messageBox && headerBox ? messageBox.y - (headerBox.y + headerBox.height) : -1000
  }).toBeGreaterThanOrEqual(8)
  await expect.poll(() => message.evaluate(el => el.getBoundingClientRect().top - el.closest('[data-conversation-scroll]')!.getBoundingClientRect().top)).toBeLessThan(130)
}
test('successive follow-ups stay below mobile controls through keyboard resizing', async ({ page }) => {
  await openChat(page)
  await page.getByRole('button', { name: 'Send follow-up', exact: true }).click()
  await expectClearHeader(page, 'follow-up-30')
  await page.getByRole('button', { name: 'Resize keyboard' }).click()
  await expectClearHeader(page, 'follow-up-30')
  await page.getByRole('button', { name: 'Resize keyboard' }).click()
  await expectClearHeader(page, 'follow-up-30')
  await page.getByRole('button', { name: 'Send follow-up', exact: true }).click()
  await expectClearHeader(page, 'follow-up-31')
})
test('follow-up scrolls even when a fast reply already fills the viewport', async ({ page }) => {
  await openChat(page)
  await page.getByRole('button', { name: 'Send with fast reply' }).click()
  await expectClearHeader(page, 'follow-up-30')
})

test('follows growing replies after the reserve fills and respects manual scrolling', async ({ page }) => {
  await openChat(page)
  await page.getByRole('button', { name: 'Send follow-up', exact: true }).click()
  await expectClearHeader(page, 'follow-up-30')
  await page.getByRole('button', { name: 'Grow reply' }).click()
  await expectClearHeader(page, 'follow-up-30')
  await page.getByRole('button', { name: 'Grow reply' }).click()
  const scroll = page.locator('[data-conversation-scroll]')
  await expect.poll(() => scroll.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(2)
  await scroll.evaluate(el => {
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -120 }))
    el.scrollTop -= 120
    el.dispatchEvent(new Event('scroll'))
  })
  const scrollTop = await scroll.evaluate(el => el.scrollTop)
  await page.getByRole('button', { name: 'Grow reply' }).click()
  await expect.poll(() => scroll.evaluate(el => el.scrollTop)).toBeCloseTo(scrollTop, 0)
  await page.getByRole('button', { name: 'Scroll to latest message' }).click()
  await expect.poll(() => scroll.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThan(2)
})
