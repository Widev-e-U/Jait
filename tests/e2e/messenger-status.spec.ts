import { expect, test, type Page } from '@playwright/test'

test.use({ screenshot: 'off' })

const minute = 60_000
const base = { encrypted: true, unableToDecrypt: false, pending: false, failed: false, reactions: [] as any[] }
const imageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZksAAAAASUVORK5CYII='
// A two-second, 16×16 blue WebM, used to exercise actual video playback.
const videoData = 'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAALLEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggEeTbuMU6uEHFO7a1OsggK17AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjAuMTYuMTAwV0GNTGF2ZjYwLjE2LjEwMESJiECfQAAAAAAAFlSua8GuAQAAAAAAADjXgQFzxYhCTfXIGbuJAZyBACK1nIN1bmSIgQCGhVZfVlA4g4EBI+ODhAvrwgDgibCBELqBEJqBAhJUw2f8c3OgY8CAZ8iaRaOHRU5DT0RFUkSHjUxhdmY2MC4xNi4xMDBzc9ZjwItjxYhCTfXIGbuJAWfIoUWjh0VOQ09ERVJEh5RMYXZjNjAuMzEuMTAyIGxpYnZweGfIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDIuMDAwMDAwMDAwAB9DtnVBEOeBAKO8gQAAgLACAJ0BKhAAEAAARwiFhYiFhIgCAgJ1qgP4Agz9KAD+/00S//xYV/FhX8WFf/FhX/z8zu3F/OYAo5WBAMgAsQEAARAQABgAGFgv9AAIAACjlYEBkACxAQABEBAAGAAYWC/0AAgAAKOVgQJYALEBAAEQEAAYABhYL/QACAAAo5WBAyAAsQEAARAQABgAGFgv9AAIAACjlYED6ACxAQABEBAAGAAYWC/0AAgAAKOVgQSwALEBAAEQEAAYABhYL/QACAAAo5WBBXgAsQEAARAQFGAAYWC/0AAgAACjlYEGQACxAQABEBAAGAAYWC/0AAgAAKOVgQcIALEBAAEQEAAYABhYL/QACAAAHFO7a5G7j7OBALeK94EB8YIBn/CBAw=='

function silentWav() {
  const samples = 8_000
  const wav = Buffer.alloc(44 + samples, 128)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + samples, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(8_000, 24)
  wav.writeUInt32LE(8_000, 28)
  wav.writeUInt16LE(1, 32)
  wav.writeUInt16LE(8, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(samples, 40)
  return wav.toString('base64')
}

type StatusMessage = typeof base & {
  id: string
  sender: string
  senderId: string
  body: string
  own: boolean
  timestamp: number
  attachment?: { url: string; name: string; mime: string; image: boolean; size?: number }
}

function defaultMessages(): StatusMessage[] {
  const now = Date.now()
  return [
    { ...base, id: '$expired', sender: 'Eve', senderId: '@eve:test', body: 'Expired', own: false, timestamp: now - 25 * 60 * minute },
    { ...base, id: '$s1', sender: 'Bob', senderId: '@bob:test', body: 'Morning run', own: false, timestamp: now - 60 * minute },
    { ...base, id: '$s2', sender: 'Bob', senderId: '@bob:test', body: 'Evening sky', own: false, timestamp: now - 20 * minute, attachment: { url: 'mxc://test/sky', name: 'sky.png', mime: 'image/png', image: true } },
    { ...base, id: '$s3', sender: 'Carol', senderId: '@carol:test', body: 'New job!', own: false, timestamp: now - 40 * minute },
  ]
}

async function mount(page: Page, options: { name?: string; topic?: string; messages?: StatusMessage[]; failFirstMedia?: boolean; hasEarlier?: boolean } = {}) {
  const commands: any[] = []
  let mediaRequests = 0
  const snapshot = {
    status: 'ready', error: null, notifications: false, assistantAccess: false, hasEarlier: options.hasEarlier ?? false,
    session: { homeserver: 'https://matrix.test', userId: '@alice:test', deviceId: 'A' },
    // Mirrors gateway snapshots from before the explicit status flag was added.
    rooms: [
      { id: '!status:test', name: options.name ?? 'WhatsApp Status Broadcast', topic: options.topic, membership: 'join', unread: 2, encrypted: true, service: 'WhatsApp', network: '', timestamp: 1, preview: 'Story' },
      { id: '!bob:test', name: 'Bob', membership: 'join', unread: 0, encrypted: true, service: 'WhatsApp', network: '', timestamp: 1, preview: 'Hello' },
    ],
    messagesByRoom: {
      '!status:test': options.messages ?? defaultMessages(),
      '!bob:test': [{ ...base, id: '$b1', sender: 'Bob', body: 'Plain chat message', own: false, timestamp: Date.now() - minute }],
    },
  }
  await page.route('**/api/messenger**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/command')) {
      commands.push(route.request().postDataJSON())
      return route.fulfill({ json: { ok: true } })
    }
    if (url.pathname.endsWith('/media')) {
      mediaRequests++
      if (options.failFirstMedia && mediaRequests === 1) return route.fulfill({ status: 500, json: {} })
      const request = route.request().postDataJSON() as { url: string }
      const data = request.url === 'mxc://test/video' ? videoData : request.url === 'mxc://test/audio' ? silentWav() : imageData
      return route.fulfill({ json: { data } })
    }
    const roomId = url.searchParams.get('roomId')
    return route.fulfill({ json: { snapshot: { ...snapshot, messages: snapshot.messagesByRoom[roomId as '!status:test'] ?? [], selectedRoomId: roomId } } })
  })
  await page.goto('/src/e2e-fixtures/messenger-gateway.html?roomId=%21status%3Atest', { waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel('Status updates')).toBeVisible()
  return { commands, mediaRequests: () => mediaRequests }
}

test('legacy gateway snapshots open a contact list and a story viewer', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const requests = await mount(page)
  const feed = page.getByLabel('Status updates')
  await expect(feed.getByRole('button', { name: 'View status from Bob' })).toContainText('2 updates')
  await expect(feed.getByRole('button', { name: 'View status from Carol' })).toContainText('1 update')
  await expect(feed.getByRole('button', { name: 'View status from Eve' })).toHaveCount(0)
  await expect(feed).not.toContainText('Morning run')
  await expect(page.getByRole('log', { name: 'Messages' })).toHaveCount(0)
  await expect(page.getByPlaceholder('Write a message…')).toHaveCount(0)
  expect(requests.mediaRequests()).toBe(0)

  const bob = feed.getByRole('button', { name: 'View status from Bob' })
  await bob.click()
  const viewer = page.getByRole('dialog', { name: 'Status from Bob' })
  await expect(viewer).toContainText('Morning run')
  await expect(viewer.getByLabel('Update 1 of 2')).toBeVisible()
  await viewer.getByRole('button', { name: 'Next status' }).click()
  const image = viewer.getByRole('img', { name: 'sky.png' })
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await expect(viewer).toContainText('Evening sky')
  await expect(viewer.getByLabel('Update 2 of 2')).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('dialog', { name: 'Status from Carol' })).toContainText('New job!')
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('dialog', { name: 'Status from Bob' })).toContainText('Evening sky')
  await page.getByRole('button', { name: 'Close status' }).click()
  await expect(bob).toBeFocused()
  expect(requests.commands.filter(command => command.action === 'read')).toHaveLength(0)
})

test('recognizes the bridge topic and keeps ordinary conversations as chats', async ({ page }) => {
  await mount(page, { name: 'WhatsApp', topic: 'Status updates from your contacts' })
  await page.getByRole('group', { name: 'Conversation Bob' }).getByRole('button').first().click()
  await expect(page.getByRole('log', { name: 'Messages' })).toContainText('Plain chat message')
  await expect(page.getByLabel('Status updates')).toHaveCount(0)
})

test('keeps contacts with the same display name separate', async ({ page }) => {
  const now = Date.now()
  await mount(page, { messages: [
    { ...base, id: '$first', sender: 'Sam', senderId: '@sam-one:test', body: 'First Sam', own: false, timestamp: now - 2 * minute },
    { ...base, id: '$second', sender: 'Sam', senderId: '@sam-two:test', body: 'Second Sam', own: false, timestamp: now - minute },
  ] })
  const contacts = page.getByRole('button', { name: 'View status from Sam' })
  await expect(contacts).toHaveCount(2)
  await expect(contacts.first()).toContainText('1 update')
  await contacts.first().click()
  await expect(page.getByRole('dialog')).toContainText('Second Sam')
})

test('pauses timed statuses and advances after resuming', async ({ page }) => {
  await page.clock.install()
  await mount(page)
  await page.getByRole('button', { name: 'View status from Bob' }).click()
  await page.getByRole('button', { name: 'Pause status' }).click()
  await page.clock.runFor(10_000)
  await expect(page.getByRole('dialog')).toContainText('Morning run')
  await page.getByRole('button', { name: 'Resume status' }).click()
  await page.clock.runFor(7_500)
  await expect(page.getByRole('dialog').getByRole('img', { name: 'sky.png' })).toBeVisible()
})

test('retries failed media and offers older updates', async ({ page }) => {
  const requests = await mount(page, { failFirstMedia: true, hasEarlier: true })
  await page.getByRole('button', { name: 'Load more updates' }).click()
  await expect.poll(() => requests.commands.some(command => command.action === 'earlier')).toBe(true)
  await page.getByRole('button', { name: 'View status from Bob' }).click()
  await page.getByRole('button', { name: 'Next status' }).click()
  await expect(page.getByRole('alert')).toContainText('Could not load this status')
  await page.getByRole('button', { name: 'Retry' }).click()
  const viewer = page.getByRole('dialog')
  const image = viewer.getByRole('img', { name: 'sky.png' })
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await expect(viewer.getByRole('alert')).toHaveCount(0)
  expect(requests.mediaRequests()).toBe(2)
})

test('plays video statuses and moves on when playback finishes', async ({ page }) => {
  const now = Date.now()
  await mount(page, { messages: [
    { ...base, id: '$video', sender: 'Bob', senderId: '@bob:test', body: 'video.webm', own: false, timestamp: now - 2 * minute, attachment: { url: 'mxc://test/video', name: 'video.webm', mime: 'video/webm', image: false } },
    { ...base, id: '$after', sender: 'Bob', senderId: '@bob:test', body: 'After the video', own: false, timestamp: now - minute },
  ] })
  await page.getByRole('button', { name: 'View status from Bob' }).click()
  const video = page.getByRole('dialog').locator('video')
  await expect(video).toBeVisible()
  await expect.poll(() => video.evaluate(element => element.currentTime)).toBeGreaterThan(0)
  await expect(page.getByRole('dialog')).toContainText('After the video', { timeout: 6_000 })
})

test('shows statuses full-screen on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mount(page)
  await page.getByRole('button', { name: 'View status from Bob' }).click()
  const viewer = page.getByRole('dialog', { name: 'Status from Bob' })
  await expect(viewer).toBeVisible()
  await expect.poll(async () => (await viewer.boundingBox())?.width).toBeCloseTo(390, 0)
  await expect.poll(async () => (await viewer.boundingBox())?.height).toBeCloseTo(844, 0)
  await viewer.getByRole('button', { name: 'Next status' }).click()
  await expect(viewer.getByRole('img', { name: 'sky.png' })).toBeVisible()
  await viewer.getByRole('button', { name: 'Close status' }).click()
  await expect(page.getByLabel('Status updates')).toBeVisible()
})

test('does not download media above the preview limit', async ({ page }) => {
  const now = Date.now()
  const requests = await mount(page, { messages: [
    { ...base, id: '$large', sender: 'Bob', senderId: '@bob:test', body: 'large.png', own: false, timestamp: now - minute, attachment: { url: 'mxc://test/large', name: 'large.png', mime: 'image/png', image: true, size: 21 * 1024 * 1024 } },
  ] })
  await page.getByRole('button', { name: 'View status from Bob' }).click()
  await expect(page.getByRole('dialog')).toContainText('exceeds the 20 MB preview limit')
  expect(requests.mediaRequests()).toBe(0)
})


test('voice statuses wait for playback and then move on', async ({ page }) => {
  const now = Date.now()
  await mount(page, { messages: [
    { ...base, id: '$audio', sender: 'Bob', senderId: '@bob:test', body: 'voice.wav', own: false, timestamp: now - 2 * minute, attachment: { url: 'mxc://test/audio', name: 'voice.wav', mime: 'audio/wav', image: false } },
    { ...base, id: '$after-audio', sender: 'Bob', senderId: '@bob:test', body: 'After the voice status', own: false, timestamp: now - minute },
  ] })
  await page.getByRole('button', { name: 'View status from Bob' }).click()
  const viewer = page.getByRole('dialog')
  const audio = viewer.locator('audio')
  await expect.poll(() => audio.evaluate(element => element.readyState)).toBeGreaterThanOrEqual(2)
  await page.waitForTimeout(1_200)
  await expect(viewer).toContainText('Voice status')
  await viewer.getByRole('button', { name: 'Resume status' }).click()
  await expect(viewer).toContainText('After the voice status', { timeout: 6_000 })
})
