import { expect, test } from '@playwright/test'

for (const wakeEvent of ['visibilitychange', 'focus', 'pageshow'] as const) {
  test(`restores a blank transcript on ${wakeEvent} after lost viewport notifications`, async ({ page }) => {
    // Only the browser notification is controlled: the real Conversation and
    // TanStack virtualizer render the transcript and calculate its visible rows.
    await page.addInitScript(() => {
      const NativeResizeObserver = window.ResizeObserver
      let suppressViewportNotifications = false
      Object.assign(window, {
        __suppressChatViewportResize: () => { suppressViewportNotifications = true },
      })
      window.ResizeObserver = class extends NativeResizeObserver {
        constructor(callback: ResizeObserverCallback) {
          super((entries, observer) => {
            const delivered = entries.filter(entry => !suppressViewportNotifications || !entry.target.hasAttribute('data-conversation-scroll'))
            if (delivered.length) callback(delivered, observer)
          })
        }
      }
    })
    await page.goto('/chat-idle-repro.html')
    const viewport = page.locator('[data-conversation-scroll]')
    await expect(page.getByText('Saved message 40', { exact: true })).toBeVisible()

    // A zero viewport empties the rendered range while the messages stay saved.
    await viewport.evaluate(el => { el.style.display = 'none' })
    await expect(page.locator('[data-conv-key]')).toHaveCount(0)
    await page.evaluate(() => Reflect.get(window, '__suppressChatViewportResize')())
    await viewport.evaluate(el => { el.style.display = '' })
    await expect(page.getByTestId('saved-message-count')).toHaveText('40')
    await expect(viewport).toBeVisible()

    await page.evaluate(event => {
      if (event === 'visibilitychange') document.dispatchEvent(new Event(event))
      else if (event === 'pageshow') window.dispatchEvent(new PageTransitionEvent(event, { persisted: true }))
      else window.dispatchEvent(new Event(event))
    }, wakeEvent)
    await expect(page.getByText('Saved message 40', { exact: true })).toBeVisible()
  })
}

test('keeps the reading position when a healthy chat regains focus', async ({ page }) => {
  await page.goto('/chat-idle-repro.html')
  const viewport = page.locator('[data-conversation-scroll]')
  await expect(page.getByText('Saved message 40', { exact: true })).toBeVisible()
  await viewport.hover()
  await page.mouse.wheel(0, -1500)
  await expect.poll(() => viewport.evaluate(el => el.scrollTop)).toBeLessThan(3000)
  const before = await viewport.evaluate(el => el.scrollTop)
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect.poll(() => viewport.evaluate(el => el.scrollTop)).toBeCloseTo(before, 0)
})
