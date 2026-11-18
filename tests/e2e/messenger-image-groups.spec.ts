import { expect, test } from '@playwright/test'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZksAAAAASUVORK5CYII='

test('groups consecutive photos while preserving each photo and its controls', async ({ page }) => {
  const timestamp = Date.now()
  const base = { sender: 'Bob', own: false, encrypted: true, unableToDecrypt: false, pending: false, failed: false, reactions: [] }
  const messages = ['one', 'two', 'three'].map((name, index) => ({
    ...base, id: '$' + name, body: name + '.png', timestamp: timestamp + index,
    attachment: { url: 'mxc://test/' + name, name: name + '.png', mime: 'image/png', image: true },
  }))
  const snapshot = {
    status: 'ready', error: null, notifications: false, assistantAccess: false, hasEarlier: false,
    session: { homeserver: 'https://matrix.test', userId: '@alice:test', deviceId: 'A' },
    rooms: [{ id: '!room:test', name: 'Bob', membership: 'join', unread: 0, encrypted: true, service: 'WhatsApp', network: '', timestamp, preview: 'Photo', status: false }],
  }
  await page.route('**/api/messenger**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/command')) return route.fulfill({ json: { ok: true } })
    if (url.pathname.endsWith('/media')) return route.fulfill({ json: { data: PNG } })
    return route.fulfill({ json: { snapshot: { ...snapshot, messages, selectedRoomId: '!room:test' } } })
  })
  await page.setViewportSize({ width: 390, height: 851 })
  await page.goto('/src/e2e-fixtures/messenger-gateway.html?roomId=%21room%3Atest', { waitUntil: 'domcontentloaded' })
  const group = page.locator('[data-image-group="true"]')
  await expect(group).toBeVisible()
  await expect(group.locator('[data-message-id]')).toHaveCount(3)
  await group.getByRole('button', { name: 'Open image two.png' }).click()
  await expect(page.getByRole('dialog').getByRole('img', { name: 'two.png' })).toBeVisible()
  await page.keyboard.press('Escape')
  await group.locator('[data-message-id="$three"]').getByRole('button', { name: 'Message options' }).click()
  await expect(page.getByRole('menuitem', { name: 'Forward' })).toBeVisible()
})
