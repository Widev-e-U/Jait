import path from 'node:path'
import { expectBadgeInkCentered } from './badge-ink'
import { expect, test, type Page } from '@playwright/test'

test.use({ screenshot: 'off' })
async function mount(page: Page, failHistory = false, reactionCount = 1, reactionKey = '❤️', read = false) {
  const calls: any[] = []
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
  const today = startOfToday.getTime()
  const yesterday = today - 86_400_000
  const base = { timestamp: yesterday + 36_000_000, encrypted: true, unableToDecrypt: false, pending: false, failed: false }
  const snapshot = {
    status: 'ready', error: null, notifications: false, assistantAccess: false, hasEarlier: true,
    session: { homeserver: 'https://matrix.test', userId: '@alice:test', deviceId: 'A' },
    rooms: [{ id: '!room:test', name: 'Bob', membership: 'join', unread: 0, encrypted: true, service: 'WhatsApp', network: '', timestamp: 1, preview: 'Hello' }],
    messages: [
      { ...base, id: '$one', sender: 'Bob', body: 'Incoming message', own: false, timestamp: yesterday + 43_200_000, reactions: [{ key: reactionKey, count: reactionCount, own: false, senders: ['Bob'] }] },
      { ...base, id: '$two', sender: 'Alice', body: 'My message', own: true, timestamp: today + 60_000, reactions: [], readBy: read ? [{ userId: '@bob:test', name: 'Bob', timestamp: today + 90_000, exact: true }] : [] },
      { ...base, id: '$image', sender: 'Bob', body: 'photo.png', own: false, timestamp: today + 120_000, attachment: { url: 'mxc://test/photo', name: 'photo.png', mime: 'image/png', image: true }, reactions: [{ key: '❤️', count: 1, own: false, senders: ['Bob'] }] },
    ],
  }
  await page.route('**/api/messenger**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/command')) {
      const cmd = route.request().postDataJSON(); calls.push(cmd)
      if (cmd.action === 'earlier') {
        if (failHistory) return route.fulfill({ status: 502, json: { error: 'private server error' } })
        snapshot.messages.unshift({ ...base, id: '$old', sender: 'Bob', body: 'Older message', own: false, reactions: [] } as any)
        snapshot.hasEarlier = false
      }
      if (cmd.action === 'edit') Object.assign(snapshot.messages.find(m => m.id === cmd.eventId)!, { body: cmd.text, edited: true })
      if (cmd.action === 'react') {
        const m = snapshot.messages.find(m => m.id === cmd.eventId)!
        const own = m.reactions?.some(r => r.key === cmd.key && r.own)
        m.reactions = own ? [] : [{ key: cmd.key, count: 1, own: true, senders: ['You'] }]
      }
      if (cmd.action === 'remove') snapshot.rooms = []
      return route.fulfill({ json: { ok: true } })
    }
    if (url.pathname.endsWith('/media')) return route.fulfill({ json: { data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZksAAAAASUVORK5CYII=' } })
    return route.fulfill({ json: { snapshot: { ...snapshot, selectedRoomId: url.searchParams.get('roomId') } } })
  })
  await page.goto('/src/e2e-fixtures/messenger-gateway.html?roomId=%21room%3Atest', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('log', { name: 'Messages' })).toContainText('Incoming message')
  return calls
}

for (const width of [1280, 390, 320]) {
  test('Messenger bubbles and inline images at ' + width, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await mount(page)
    const incoming = page.locator('[data-message-id="$one"] [data-messenger-bubble]')
    const own = page.locator('[data-message-id="$two"] [data-messenger-bubble]')
    await expect(incoming).toBeVisible()
    await expect(own).toBeVisible()
    expect(await incoming.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')
    await expect(page.getByRole('img', { name: 'photo.png' })).toBeVisible()
    await expect(page.getByRole('button', { name: /forward/i })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/messenger-bubbles-' + width + '.png') })
  })
}

test('Outgoing message status uses compact checks and retains read details', async ({ page }) => {
  await mount(page)
  const own = page.locator('[data-message-id="$two"]')
  await expect(own.getByRole('img', { name: 'Sent', exact: true })).toBeVisible()
  await expect(own).not.toContainText('Sent')
  await mount(page, false, 1, '❤️', true)
  const receipt = own.getByRole('button', { name: 'Read; show receipts' })
  await expect(receipt).toBeVisible()
  await expect(own).not.toContainText('Seen')
  await receipt.click()
  await expect(page.getByText('Bob', { exact: true }).last()).toBeVisible()
  await expect(page.getByText(/Read at/)).toBeVisible()
})

test('React, remove reaction, and edit own message', async ({ page }) => {
  const calls = await mount(page)
  const own = page.locator('[data-message-id="$two"]')
  await own.locator('p').last().click({ button: 'right' })
  await page.getByRole('toolbar', { name: 'Message reactions' }).getByRole('button', { name: 'React to message' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'React with 👍' }).click()
  const reaction = own.locator('[data-reaction-pills]').getByRole('button', { name: '👍 reaction by You', exact: true })
  await expect(reaction).toHaveAttribute('aria-pressed', 'true')
  await expect(reaction).toContainText('👍')
  await reaction.click()
  await expect(reaction).toHaveCount(0)
  await own.getByRole('button', { name: 'Message options' }).click()
  await page.getByRole('menuitem', { name: 'Edit message' }).click()
  await own.getByRole('textbox', { name: 'Edit message' }).fill('Updated message')
  await own.getByRole('button', { name: 'Save' }).click()
  await expect(own).toContainText('Updated message')
  await expect(own).toContainText('Edited')
  expect(calls.filter(c => c.action === 'react')).toHaveLength(2)
  expect(calls).toContainEqual({ action: 'edit', roomId: '!room:test', eventId: '$two', text: 'Updated message' })
})

test('Day dividers label today and yesterday', async ({ page }) => {
  await mount(page)
  const dividers = page.locator('[data-day-divider]')
  await expect(dividers).toHaveCount(2)
  await expect(dividers.first()).toHaveText(/yesterday|gestern/i)
  await expect(dividers.last()).toHaveText(/today|heute/i)
  // Same-day messages share one divider.
  await expect(page.locator('[data-message-id="$image"] [data-day-divider]')).toHaveCount(0)
})

test('Reaction row opens at the pointer and on a stationary finger hold', async ({ page }) => {
  await mount(page)
  const own = page.locator('[data-message-id="$two"]')
  const bar = page.getByRole('toolbar', { name: 'Message reactions' })
  await own.locator('p').last().hover()
  await expect(bar).toBeVisible()
  await expect(page.getByLabel('Message actions')).toContainText('Forward')
  await page.keyboard.press('Escape')
  const body = own.locator('p').last()
  const box = (await body.boundingBox())!
  await body.click({ button: 'right', position: { x: 5, y: 5 } })
  await expect(bar).toBeVisible()
  const barBox = (await page.locator('[data-reaction-bar]').boundingBox())!
  expect(Math.abs(barBox.x - Math.max(4, Math.min(box.x + 5, (page.viewportSize()?.width ?? 1280) - 242)))).toBeLessThan(3)
  expect(Math.abs(barBox.y - (box.y + 5))).toBeLessThan(3)
  await expect(bar.getByRole('button')).toHaveCount(7)
  await page.keyboard.press('Escape')
  await expect(bar).toHaveCount(0)

  await page.mouse.move(0, 0)
  const incoming = page.locator('[data-message-id="$one"] p').last()
  await incoming.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, clientX: 100, clientY: 100 })
  await incoming.dispatchEvent('pointermove', { pointerType: 'touch', clientX: 100, clientY: 120 })
  await page.waitForTimeout(500)
  await expect(bar).toHaveCount(0)
  await incoming.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, clientX: 100, clientY: 100 })
  await expect(bar).toBeVisible()
  await incoming.dispatchEvent('pointerup', { pointerType: 'touch' })
  await page.keyboard.press('Escape')
  await expect(bar).toHaveCount(0)
})


test('Reply actions and a right swipe focus the message editor', async ({ page }) => {
  await mount(page)
  const incoming = page.locator('[data-message-id="$one"]')
  const editor = page.getByRole('textbox', { name: 'Message', exact: true })
  await incoming.getByRole('button', { name: 'Message options' }).click()
  await page.getByRole('menuitem', { name: 'Reply', exact: true }).click()
  await expect(page.locator('[data-reply-preview]')).toContainText('Incoming message')
  await expect(editor).toBeFocused()
  await page.getByRole('button', { name: 'Cancel reply' }).click()
  const body = incoming.locator('p').last()
  await page.evaluate(() => { (window as any).__vibrations = []; Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (duration: number) => { (window as any).__vibrations.push(duration); return true } }) })
  await expect(body).toHaveCSS('user-select', 'none')
  await body.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 100, clientY: 100 })
  await body.dispatchEvent('pointermove', { pointerType: 'touch', clientX: 180, clientY: 102 })
  await expect(incoming.locator('[data-messenger-bubble]').locator('..')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 44, 0)')
  await body.dispatchEvent('pointermove', { pointerType: 'touch', clientX: 185, clientY: 102 })
  expect(await page.evaluate(() => (window as any).__vibrations)).toEqual([10])
  await body.dispatchEvent('pointerup', { pointerType: 'touch', clientX: 185, clientY: 102 })
  await expect(page.locator('[data-reply-preview]')).toContainText('Incoming message')
  await expect(editor).toBeFocused()
  await page.getByRole('button', { name: 'Cancel reply' }).click()
  await body.hover()
  await expect(page.getByLabel('Message actions')).toBeVisible()
  await page.getByLabel('Message actions').getByRole('button', { name: 'Reply', exact: true }).click()
  await expect(editor).toBeFocused()
})

test('Chat options remove conversation with clear confirmation', async ({ page }) => {
  const calls = await mount(page)
  await page.getByRole('button', { name: 'Conversation options', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: /Mark as unread/ })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /Search messages/ })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Remove conversation' }).click()
  await expect(page.getByRole('dialog')).toContainText('leave')
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Conversation Bob' })).toHaveCount(0)
  expect(calls).toContainEqual({ action: 'remove', roomId: '!room:test' })
})

test('History loads older messages and stops at exhaustion', async ({ page }) => {
  const calls = await mount(page)
  const log = page.getByRole('log', { name: 'Messages' })
  await log.evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')) })
  await expect(log).toContainText('Older message')
  await expect(page.getByRole('button', { name: 'Load earlier messages' })).toHaveCount(0)
  expect(calls.filter(c => c.action === 'earlier')).toHaveLength(1)
})

test('Failed edits keep the text available for retry', async ({ page }) => {
  await mount(page)
  await page.route('**/api/messenger/command', route => route.request().postDataJSON().action === 'edit'
    ? route.fulfill({ status: 400, json: { error: 'Rejected' } }) : route.fallback())
  const own = page.locator('[data-message-id="$two"]')
  await own.getByRole('button', { name: 'Message options' }).click()
  await page.getByRole('menuitem', { name: 'Edit message' }).click()
  await own.getByRole('textbox', { name: 'Edit message' }).fill('Keep my edit')
  await own.getByRole('button', { name: 'Save' }).click()
  await expect(own.getByRole('alert')).toContainText('Could not update')
  await expect(own.getByRole('textbox', { name: 'Edit message' })).toHaveValue('Keep my edit')
})

test('Search messages from the mobile chat menu reveals the search field', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 })
  await mount(page)
  await page.getByRole('button', { name: 'Conversation options', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Search messages', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Search conversations and messages' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Search conversations and messages' })).toBeFocused()
})


test('History failures show one notification, pause automatic loads, and allow retry', async ({ page }) => {
  const calls = await mount(page, true)
  const notification = page.locator('[data-sonner-toast]:not([data-removed="true"])').filter({ hasText: 'Could not load earlier messages' })
  await expect(notification).toBeVisible()
  await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/messenger-error-notification.png') })
  await expect(page.getByRole('log', { name: 'Messages' })).toContainText('Incoming message')
  await expect(page.getByRole('button', { name: 'Load earlier messages' })).toHaveCount(0)
  await expect(notification).not.toContainText('private server error')
  expect(calls.filter(c => c.action === 'earlier')).toHaveLength(1)
  await notification.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect.poll(() => calls.filter(c => c.action === 'earlier').length).toBe(2)
  await expect(notification).toBeVisible()
  await notification.getByRole('button', { name: 'Close toast' }).click()
  await expect(notification).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Dismiss error' })).toHaveCount(0)
})


for (const count of [1, 3]) {
  test(`reaction badge is ${count === 1 ? 'a centered circle' : 'a pill with a count'}`, async ({ page }) => {
    await mount(page, false, count)
    const reaction = page.locator('[data-message-id="$one"] [data-reaction-pills]').getByRole('button')
    await expect(reaction).toBeVisible()
    const bounds = await reaction.boundingBox()
    if (count === 1) {
      expect(bounds!.width).toBe(bounds!.height)
      await expect(reaction).not.toContainText('1')
    } else {
      expect(bounds!.width).toBeGreaterThan(bounds!.height)
      await expect(reaction).toContainText(String(count))
    }
    await expectBadgeInkCentered(reaction, 'reaction', 'reaction-' + count)
    await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/messenger-reaction-count-' + count + '.png') })
  })
}


for (const emoji of ['👍', '😂', '🔥']) {
  test(`reaction glyph ink is centered for ${emoji}`, async ({ page }) => {
    await mount(page, false, 1, emoji)
    const reaction = page.locator('[data-message-id="$one"] [data-reaction-pills]').getByRole('button')
    await expect(reaction).toBeVisible()
    await expectBadgeInkCentered(reaction, 'reaction', 'emoji-' + emoji.codePointAt(0)!.toString(16))
  })
}


test('image reactions overlap the center of the bottom edge', async ({ page }) => {
  await mount(page)
  const image = page.locator('[data-message-id="$image"]')
  const bubble = (await image.locator('[data-messenger-bubble]').boundingBox())!
  const reaction = (await image.locator('[data-reaction-pills] button').boundingBox())!
  expect(Math.abs((reaction.x + reaction.width / 2) - (bubble.x + bubble.width / 2))).toBeLessThan(1)
  expect(Math.abs((reaction.y + reaction.height / 2) - (bubble.y + bubble.height))).toBeLessThan(1)
})
