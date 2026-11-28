import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'

const shotsDir = resolve(__dirname, '../../.jait/shots')

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

test('Messenger groups consecutive messages and keeps their actions accessible', async ({ page, hasTouch }) => {
  const roomId = '!room:test'
  const timestamp = new Date(2026, 10, 27, 10, 30).getTime()
  const message = (id: string, body: string, offset: number, sender = 'Riley') => ({
    id, body, sender, timestamp: timestamp + offset, own: sender === 'Alice',
    encrypted: false, unableToDecrypt: false, pending: false, failed: false,
  })
  const messages = [
    message('$first', 'I found the deployment notes.', 0),
    message('$second', 'The dates are in the release history.', 20_000),
    message('$third', 'I can add those to the document.', 40_000),
    message('$own-first', 'That would be great, thanks!', 65_000, 'Alice'),
    message('$own-second', 'Please include the staging dates too.', 80_000, 'Alice'),
    message('$later', 'The document is updated.', 420_000),
  ]
  await page.route('**/api/messenger**', route => route.fulfill({ json: { snapshot: {
    status: 'ready', error: null, notifications: false, assistantAccess: false,
    session: { homeserver: 'https://matrix.test', userId: '@alice:test', deviceId: 'A' },
    rooms: [{ id: roomId, name: 'Riley', membership: 'join', unread: 0, service: 'WhatsApp', network: '', timestamp, preview: messages.at(-1)?.body }],
    selectedRoomId: roomId, messages, typing: [],
  } } }))
  await page.setViewportSize({ width: 440, height: 705 })
  await page.goto('/src/e2e-fixtures/messenger-gateway.html?roomId=%21room%3Atest')
  const log = page.getByRole('log', { name: 'Messages' })
  const row = (id: string) => log.locator(`[data-message-id="${id}"]`)
  await expect(row('$later')).toBeVisible()
  await expect(log.locator('time')).toHaveCount(3)
  await expect(log.getByText('Riley', { exact: true })).toHaveCount(2)
  await expect(log.locator('[data-day-divider]')).toHaveCount(1)
  await expect(row('$own-second').locator('time')).toHaveCount(0)
  const messageOptions = (id: string) => row(id).getByRole('button', { name: 'Message options' })
  const followUp = row('$second').getByText(messages[1].body, { exact: true })
  const options = messageOptions('$second')
  await expect(messageOptions('$first')).toHaveCSS('opacity', '1')
  await expect(options).toHaveCSS('opacity', '0')
  await expect(messageOptions('$own-second')).toHaveCSS('opacity', '0')
  await page.screenshot({ path: resolve(shotsDir, hasTouch ? 'messenger-grouped-messages-touch.png' : 'messenger-grouped-messages.png') })
  if (hasTouch) {
    await expect(options).toHaveCSS('pointer-events', 'none')
    await followUp.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true, clientX: 100, clientY: 200 })
    await expect(page.getByRole('button', { name: 'Forward', exact: true })).toBeVisible()
    await followUp.dispatchEvent('pointerup', { pointerType: 'touch' })
    await page.keyboard.press('Escape')
  } else {
    await followUp.hover()
    await expect(options).toHaveCSS('opacity', '1')
    await page.mouse.move(0, 0)
    await expect(options).toHaveCSS('opacity', '0')
  }
  await options.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menuitem', { name: 'Forward' })).toBeVisible()
  await page.keyboard.press('Escape')
})
