import { expect, test } from '@playwright/test'

test.use({ screenshot: 'off' })

test('Messenger opens at the bottom and animates only live messages', async ({ page }) => {
  const roomId = '!room:test'
  const timestamp = Date.now() - 60_000
  const message = (id: string, body: string, time: number, own = false) => ({
    id, body, timestamp: time, sender: own ? 'Alice' : 'Bob', own,
    encrypted: false, unableToDecrypt: false, pending: false, failed: false,
  })
  const messages = [message('$history', 'Existing message', timestamp)]
  let typing: string[] = []
  await page.route('**/api/messenger**', async route => {
    if (new URL(route.request().url()).pathname.endsWith('/command')) {
      const command = route.request().postDataJSON()
      if (command.action === 'send') {
        messages.push(message('$outgoing', command.text, Date.now(), true))
        return route.fulfill({ json: { eventId: '$outgoing' } })
      }
      return route.fulfill({ json: { ok: true } })
    }
    return route.fulfill({ json: { snapshot: {
      status: 'ready', error: null, notifications: false, assistantAccess: false,
      session: { homeserver: 'https://matrix.test', userId: '@alice:test', deviceId: 'A' },
      rooms: [{ id: roomId, name: 'Bob', membership: 'join', unread: 0, service: 'WhatsApp', network: '', timestamp, preview: 'Existing message' }],
      selectedRoomId: roomId, messages, typing,
    } } })
  })
  await page.addInitScript(() => {
    const animate = Element.prototype.animate
    Element.prototype.animate = function (...args) {
      if (this.hasAttribute('data-message-id')) {
        const record = document.documentElement.dataset
        record.messageAnimations = [...(record.messageAnimations?.split(',') ?? []), this.textContent].join(',')
      }
      return animate.apply(this, args)
    }
  })
  await page.goto('/src/e2e-fixtures/messenger-gateway.html?roomId=%21room%3Atest')
  const log = page.getByRole('log', { name: 'Messages' })
  const animations = () => page.locator('html').getAttribute('data-message-animations')
  await expect(log.getByText('Existing message')).toBeVisible()
  const historyBottom = await log.evaluate(element => {
    const row = element.querySelector('[data-message-id]')!
    return element.getBoundingClientRect().bottom - row.getBoundingClientRect().bottom
  })
  expect(historyBottom).toBeLessThan(60)
  expect(await animations()).toBeNull()

  const logHeight = await log.evaluate(element => element.clientHeight)
  typing = ['Bob']
  await expect(page.getByRole('status').filter({ hasText: 'Bob is typing' })).toBeVisible()
  expect(await log.evaluate(element => element.clientHeight)).toBe(logHeight)
  typing = []

  messages.push(message('$incoming', 'Live incoming message', Date.now()))
  await expect(log.getByText('Live incoming message')).toBeVisible()
  await expect.poll(animations).toContain('Live incoming message')

  const editor = page.getByRole('textbox', { name: 'Message', exact: true })
  await editor.fill('Live outgoing message')
  await editor.press('Enter')
  await expect(log.locator('[data-message-id="$outgoing"]')).toBeVisible()
  await expect.poll(async () => (await animations())?.match(/Live outgoing message/g)?.length).toBe(1)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  messages.push(message('$reduced', 'Reduced motion message', Date.now()))
  await expect(log.getByText('Reduced motion message')).toBeVisible()
  expect(await animations()).not.toContain('Reduced motion message')
})
