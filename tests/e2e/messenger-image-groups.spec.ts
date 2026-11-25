import { expect, test } from '@playwright/test'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZksAAAAASUVORK5CYII='

// A half-second 16×16 VP8 clip served through the same media route as the photos.
const WEBM = 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwH/////////EU2bdKtNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggEe7AEAAAAAAABoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjAuMTYuMTAwV0GNTGF2ZjYwLjE2LjEwMESJiEB/QAAAAAAAFlSua8GuAQAAAAAAADjXgQFzxYgM47N/JMvE85yBACK1nIN1bmSIgQCGhVZfVlA4g4EBI+ODhAX14QDgibCBELqBEJqBAhJUw2fYc3OgY8CAZ8iaRaOHRU5DT0RFUkSHjUxhdmY2MC4xNi4xMDBzc7JjwItjxYgM47N/JMvE82fIoUWjh0VOQ09ERVJEh5RMYXZjNjAuMzEuMTAyIGxpYnZweB9DtnVAhOeBAKOjgQAAgBACAJ0BKhAAEAAARwiFhYiFhIgCAgAMDWAA/v+rUICjlYEAZACxAQAFEKwAGAAYWC/0AAgAAKOVgQDIALEBAAUQrAAYABhYL/QACAAAo5WBASwAsQEABRCsABgAGFgv9AAIAACjlYEBkACxAQAFEKwAGAAYWC/0AAgAAA=='

test('caps album previews and loads hidden media on demand while preserving cached playback', async ({ page }) => {
  const timestamp = Date.now()
  const base = { sender: 'Bob', own: false, encrypted: true, unableToDecrypt: false, pending: false, failed: false, reactions: [] }
  const photos = ['one', 'two', 'three', 'four', 'five', 'six'].map((name, index) => ({
    ...base, id: '$' + name, body: name + '.png', timestamp: timestamp + index,
    attachment: { url: 'mxc://test/' + name, name: name + '.png', mime: 'image/png', image: true },
  }))
  const video = {
    ...base, id: '$video', body: 'clip.webm', timestamp: timestamp + 2.5,
    attachment: { url: 'mxc://test/video', name: 'clip.webm', mime: 'video/webm', image: false },
  }
  const earlier = Array.from({ length: 160 }, (_, index) => ({
    ...base, id: `$earlier-${index}`, body: `Earlier message ${index}`, timestamp: timestamp - 1000 + index,
  }))
  const messages = [...earlier, ...photos.slice(0, 3), video, ...photos.slice(3)]
  const mediaRequests = new Map<string, number>()
  const snapshot = {
    status: 'ready', error: null, notifications: false, assistantAccess: false, hasEarlier: false,
    session: { homeserver: 'https://matrix.test', userId: '@alice:test', deviceId: 'A' },
    rooms: [{ id: '!room:test', name: 'Bob', membership: 'join', unread: 0, encrypted: true, service: 'WhatsApp', network: '', timestamp, preview: 'Photo', status: false }],
  }
  await page.route('**/api/messenger**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/command')) return route.fulfill({ json: { ok: true } })
    if (url.pathname.endsWith('/media')) {
      const { url: mediaUrl } = route.request().postDataJSON() as { url: string }
      mediaRequests.set(mediaUrl, (mediaRequests.get(mediaUrl) ?? 0) + 1)
      return route.fulfill({ json: { data: mediaUrl === video.attachment.url ? WEBM : PNG } })
    }
    return route.fulfill({ json: { snapshot: { ...snapshot, messages, selectedRoomId: '!room:test' } } })
  })
  await page.setViewportSize({ width: 390, height: 851 })
  await page.goto('/src/e2e-fixtures/messenger-gateway.html?roomId=%21room%3Atest', { waitUntil: 'domcontentloaded' })
  const group = page.locator('[data-image-group="true"]')
  await expect(group).toBeVisible()
  await expect(group.locator('[data-messenger-bubble]')).toHaveCount(4)
  await expect(group.getByRole('img')).toHaveCount(3)
  const overflow = group.getByRole('button', { name: 'Open album with 3 more attachments' })
  await expect(overflow).toHaveText('+3')
  for (const name of ['four', 'five', 'six', 'video']) expect(mediaRequests.has('mxc://test/' + name)).toBe(false)
  await group.getByRole('button', { name: 'Open image two.png' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('img', { name: 'two.png' })).toBeVisible()
  const dialogElement = await dialog.elementHandle()
  const initialHeight = await dialog.evaluate(element => element.offsetHeight)
  await dialog.getByRole('button', { name: 'Next attachment' }).click()
  await expect(dialog.getByRole('img', { name: 'three.png' })).toBeVisible()
  expect(await dialogElement?.evaluate(element => element.isConnected)).toBe(true)
  expect(await dialog.evaluate(element => element.offsetHeight)).toBe(initialHeight)
  await page.keyboard.press('ArrowLeft')
  await expect(dialog.getByRole('img', { name: 'two.png' })).toBeVisible()
  await page.keyboard.press('Escape')
  await group.locator('[data-message-id="$three"]').getByRole('button', { name: 'Message options' }).click()
  await expect(page.getByRole('menuitem', { name: 'Forward' })).toBeVisible()
  await page.keyboard.press('Escape')

  const player = page.locator('video[aria-label="clip.webm"]')
  await overflow.click()
  await expect(dialog.getByRole('heading')).toHaveText('clip.webm (4 / 7)')
  await expect(player).toHaveJSProperty('controls', true)
  await player.evaluate((element: HTMLVideoElement) => element.play())
  await expect.poll(() => player.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0)

  await dialog.getByRole('button', { name: 'Next attachment' }).click()
  await expect(dialog.getByRole('img', { name: 'four.png' })).toBeVisible()
  expect(mediaRequests.has('mxc://test/six')).toBe(false)
  await page.keyboard.press('Escape')

  const scroll = page.locator('[data-conversation-scroll]')
  await scroll.evaluate(element => { element.scrollTop = 0 })
  await expect(group).toHaveCount(0)
  await expect(player).toHaveCount(0)
  await scroll.evaluate(element => { element.scrollTop = element.scrollHeight })
  await expect(group.getByRole('img', { name: 'two.png' })).toBeVisible()
  await overflow.click()
  await expect(player).toBeVisible()
  expect(mediaRequests.get('mxc://test/two')).toBe(1)
  expect(mediaRequests.get(video.attachment.url)).toBe(1)
})
