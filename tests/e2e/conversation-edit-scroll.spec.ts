import path from 'node:path'
import { expect, test } from '@playwright/test'

test('editing an earlier message jumps directly to the restarted turn', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Element.prototype.scrollTo
    ;(window as typeof window & { smoothChatScrolls: number }).smoothChatScrolls = 0
    Element.prototype.scrollTo = function (...args) {
      if (this.hasAttribute('data-conversation-scroll') && typeof args[0] === 'object' && args[0]?.behavior === 'smooth') {
        ;(window as typeof window & { smoothChatScrolls: number }).smoothChatScrolls += 1
      }
      return original.apply(this, args)
    }
  })
  await page.goto(`/@fs${path.resolve(process.cwd(), 'fixtures/conversation-edit-scroll.html')}`)
  const scroll = page.locator('[data-conversation-scroll]')
  await expect.poll(() => scroll.evaluate(element => element.scrollHeight - element.clientHeight)).toBeGreaterThan(1000)
  await scroll.evaluate(element => { element.scrollTop = 0 })
  await page.evaluate(() => { (window as typeof window & { smoothChatScrolls: number }).smoothChatScrolls = 0 })
  await page.getByRole('button', { name: 'Edit and send' }).click()
  const editedMessage = page.getByText('Edited message')
  await expect(editedMessage).toBeVisible()
  await expect.poll(() => editedMessage.evaluate(element => {
    const scroll = element.closest('[data-conversation-scroll]')!
    return element.getBoundingClientRect().top - scroll.getBoundingClientRect().top
  })).toBeGreaterThanOrEqual(0)
  await expect.poll(() => editedMessage.evaluate(element => {
    const scroll = element.closest('[data-conversation-scroll]')!
    return element.getBoundingClientRect().top - scroll.getBoundingClientRect().top
  })).toBeLessThan(100)
  await expect.poll(() => page.evaluate(() => (window as typeof window & { smoothChatScrolls: number }).smoothChatScrolls)).toBe(0)
})
