import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

test.use({ screenshot: 'off' })

const shot = (name: string) => path.resolve(__dirname, '../../.jait/shots/' + name + '.png')

const startOfToday = new Date()
startOfToday.setHours(0, 0, 0, 0)
const today = startOfToday.getTime()
const yesterday = today - 86_400_000

const base = { encrypted: true, unableToDecrypt: false, pending: false, failed: false, reactions: [] as any[] }

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZksAAAAASUVORK5CYII='

/** Screenshot-only showcase for the WhatsApp-parity UI states. */
test('capture showcase screenshots', async ({ page }) => {
  const snapshot = {
    status: 'ready', error: null, notifications: false, assistantAccess: false, hasEarlier: true,
    session: { homeserver: 'https://matrix.test', userId: '@alice:test', deviceId: 'A' },
    rooms: [
      { id: '!status:test', name: 'WhatsApp Status Broadcast', membership: 'join', unread: 0, encrypted: true, service: 'WhatsApp', network: '', timestamp: 1, preview: 'Story', status: true },
      { id: '!room:test', name: 'Bob', membership: 'join', unread: 0, encrypted: true, service: 'WhatsApp', network: '', timestamp: 1, preview: 'Hello', status: false },
    ],
    messagesByRoom: {
      '!status:test': [
        { ...base, id: '$s1', sender: 'Bob', body: 'Morning run', own: false, timestamp: Date.now() - 36 * 60 * 60_000 },
        { ...base, id: '$s2', sender: 'Bob', body: 'Sunset', own: false, timestamp: Date.now() - 60_000, attachment: { url: 'mxc://test/sunset', name: 'sunset.png', mime: 'image/png', image: true } },
        { ...base, id: '$s3', sender: 'Carol', body: 'New job!', own: false, timestamp: Date.now() - 30_000 },
      ],
      '!room:test': [
        { ...base, id: '$one', sender: 'Bob', body: 'Incoming message', own: false, timestamp: yesterday + 43_200_000, reactions: [{ key: '❤️', count: 1, own: false, senders: ['Bob'] }] },
        { ...base, id: '$two', sender: 'Alice', body: 'My message', own: true, timestamp: today + 60_000 },
        { ...base, id: '$image', sender: 'Bob', body: 'photo.png', own: false, timestamp: today + 120_000, attachment: { url: 'mxc://test/photo', name: 'photo.png', mime: 'image/png', image: true } },
      ],
    },
  }
  await page.route('**/api/messenger**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/command')) return route.fulfill({ json: { ok: true } })
    if (url.pathname.endsWith('/media')) return route.fulfill({ json: { data: PNG } })
    const roomId = url.searchParams.get('roomId')
    return route.fulfill({ json: { snapshot: { ...snapshot, messages: snapshot.messagesByRoom[roomId as '!status:test'] ?? [], selectedRoomId: roomId } } })
  })

  // 1. WhatsApp status broadcast rendered as a read-only feed (desktop + mobile).
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/src/e2e-fixtures/messenger-gateway.html?roomId=%21status%3Atest', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[aria-label="Status updates"]')).toBeVisible()
    await page.getByRole('button', { name: 'View status from Bob' }).click()
    await expect(page.locator('[data-status-update-id="$s2"] img')).toBeVisible()
    await page.screenshot({ path: shot('showcase-status-' + width) })
  }

  // 2. Compact transcript with day dividers.
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/src/e2e-fixtures/messenger-gateway.html?roomId=%21room%3Atest', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-day-divider]')).toHaveCount(2)
  await page.screenshot({ path: shot('showcase-transcript-1280') })

  // 3. Hover raises the WhatsApp-Web-style quick-reaction row.
  const own = page.locator('[data-message-id="$two"]')
  await own.hover()
  await expect(own.locator('[data-reaction-bar]')).toHaveCSS('opacity', '1')
  await page.screenshot({ path: shot('showcase-reactions-hover-1280') })

  // 4. Search button opens the full searchable emoji panel.
  await own.getByRole('button', { name: 'React to message' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.screenshot({ path: shot('showcase-emoji-picker-1280') })
  await page.getByRole('dialog').getByRole('textbox', { name: 'Search emoji' }).fill('heart')
  await expect(page.getByRole('dialog').getByRole('button', { name: /herz|heart/i }).first()).toBeVisible()
  await page.screenshot({ path: shot('showcase-emoji-search-1280') })
  await page.keyboard.press('Escape')

  // 5. Phones cannot hover: holding a message opens the same row.
  await page.setViewportSize({ width: 390, height: 851 })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-day-divider]')).toHaveCount(2)
  const incoming = page.locator('[data-message-id="$one"]')
  await incoming.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true })
  await expect(incoming.locator('[data-reaction-bar]')).toHaveAttribute('data-open', 'true')
  await page.screenshot({ path: shot('showcase-reactions-longpress-390') })
})
