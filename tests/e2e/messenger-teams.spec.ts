import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import type { MessengerMessage } from '@jait/shared'

test.use({ screenshot: 'off' })

const base = { encrypted: false, unableToDecrypt: false, pending: false, failed: false, reactions: [] as any[] }

/**
 * Team platforms arrive as a Matrix space (the team) plus channel rooms. The
 * page must group channels under their team and open channels with a
 * channel-flavoured header, while plain chats keep the normal transcript.
 */
async function mount(page: Page, roomId = '!general:test', service = 'Slack', earlier?: Promise<void>, additionalMessages: MessengerMessage[] = []) {
  const calls: any[] = []
  const snapshot = {
    status: 'ready', error: null, notifications: false, assistantAccess: false, hasEarlier: !!earlier,
    session: { homeserver: 'https://matrix.test', userId: '@alice:test', deviceId: 'A' },
    rooms: [
      { id: '!eng:test', name: 'Engineering', membership: 'join', unread: 0, encrypted: false, service, network: 'Acme', timestamp: 1, preview: 'Team', kind: 'team' },
      { id: '!general:test', name: 'general', membership: 'join', unread: 2, encrypted: false, service, network: 'Acme', team: 'Engineering', kind: 'channel', topic: 'Team-wide announcements', timestamp: 2, preview: 'Deploy done' },
      { id: '!random:test', name: 'random', membership: 'join', unread: 0, encrypted: false, service, network: 'Acme', team: 'Engineering', kind: 'channel', timestamp: 3, preview: 'Meme of the day' },
      { id: '!bob:test', name: 'Bob', membership: 'join', unread: 0, encrypted: true, service: 'WhatsApp', network: '', timestamp: 4, preview: 'Hello', kind: 'chat' },
    ],
    messagesByRoom: {
      '!general:test': [
        { ...base, id: '$g1', sender: 'Carol', body: 'Deploy done', own: false, timestamp: Date.now() - 3_600_000 },
        { ...base, id: '$g2', sender: 'Alice', body: 'Nice work @channel', own: true, timestamp: Date.now() - 1_800_000 },
        ...additionalMessages,
      ],
      '!random:test': [
        { ...base, id: '$r1', sender: 'Dan', body: 'Meme of the day', own: false, timestamp: Date.now() - 600_000 },
      ],
      '!bob:test': [
        { ...base, id: '$b1', sender: 'Bob', body: 'Plain chat message', own: false, timestamp: Date.now() - 60_000 },
      ],
    },
  }
  await page.route('**/api/messenger**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/command')) {
      const command = route.request().postDataJSON()
      calls.push(command)
      if (command.action === 'earlier' && earlier) await earlier
      return route.fulfill({ json: { ok: true } })
    }
    if (url.pathname.endsWith('/media')) return route.fulfill({ json: { data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZksAAAAASUVORK5CYII=' } })
    return route.fulfill({ json: { snapshot: { ...snapshot, messages: snapshot.messagesByRoom[roomId as '!general:test'] ?? [], selectedRoomId: roomId } } })
  })
  await page.goto('/src/e2e-fixtures/messenger-gateway.html?roomId=' + encodeURIComponent(roomId), { waitUntil: 'domcontentloaded' })
  return calls
}

test('Teams group their channels and a channel opens with a channel header', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await mount(page)

  // The team is a section header with a channel count, not a flat conversation.
  const team = page.getByRole('button', { name: 'Team Engineering' })
  await expect(team).toBeVisible()
  await expect(team).toHaveAttribute('aria-expanded', 'true')
  await expect(team).toContainText('2 channels')
  await expect(team.getByText('2', { exact: true })).toBeVisible() // unread total of #general
  const section = page.locator('[data-team-section="Engineering"]')
  await expect(section.locator('[data-room-kind="channel"]')).toHaveCount(2)
  await expect(page.getByRole('group', { name: 'Conversation general' })).toContainText('#general')
  await expect(page.getByRole('group', { name: 'Conversation random' })).toContainText('#random')

  // Opening a channel shows channel identity and Slack-style messages.
  await page.getByRole('group', { name: 'Conversation general' }).getByRole('button').first().click()
  await expect(page.getByRole('heading', { name: '#general' })).toBeVisible()
  await expect(page.locator('main').getByText('Engineering · Slack')).toBeVisible()
  await expect(page.locator('[data-channel-topic]')).toHaveText('Team-wide announcements')
  await expect(page.getByRole('log', { name: 'Messages' })).toContainText('Deploy done')
  await expect(page.locator('[data-messenger-bubble][data-message-style="channel"]')).toHaveCount(2)
  await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/messenger-channel.png') })
})

test('Team sections collapse while plain chats keep the normal transcript', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await mount(page, '!bob:test')

  await page.getByRole('button', { name: 'Team Engineering' }).click()
  await expect(page.getByRole('button', { name: 'Team Engineering' })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('[data-team-section="Engineering"] [data-room-kind="channel"]')).toHaveCount(0)
  // Chats are not swallowed by the team grouping.
  await expect(page.getByRole('group', { name: 'Conversation Bob' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Conversation Bob' })).toHaveAttribute('data-room-kind', 'chat')

  // A plain chat keeps the WhatsApp-style bubbles.
  await page.getByRole('group', { name: 'Conversation Bob' }).getByRole('button').first().click()
  await expect(page.getByRole('log', { name: 'Messages' })).toContainText('Plain chat message')
  await expect(page.locator('[data-messenger-bubble][data-message-style="chat"]')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: 'Bob' })).toBeVisible()
  await expect(page.locator('[data-channel-topic]')).toHaveCount(0)
})


test('Teams can be filtered separately from WhatsApp', async ({ page }) => {
  await mount(page, '!general:test', 'Teams')
  const filters = page.getByRole('group', { name: 'Filter conversations' })
  await expect(filters.getByRole('button', { name: 'WhatsApp', exact: true })).toBeVisible()
  await filters.getByRole('button', { name: 'Teams', exact: true }).click()
  await expect(filters.getByRole('button', { name: 'Teams', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('group', { name: 'Conversation general' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Conversation Bob' })).toHaveCount(0)
})


test('Teams messages show bridge confirmations separately from reader receipts', async ({ page }) => {
  const timestamp = Date.now()
  const ownMessage = { ...base, sender: 'Alice', own: true, timestamp }
  await mount(page, '!general:test', 'Teams', undefined, [
    { ...ownMessage, id: '$sent', body: 'Confirmed by bridge', bridgeStatus: 'sent' },
    { ...ownMessage, id: '$delivered', body: 'Delivered to recipient', bridgeStatus: 'delivered' },
    { ...ownMessage, id: '$read', body: 'Opened by recipient', readBy: [{ userId: '@carol:test', name: 'Carol', timestamp, exact: true }] },
  ])

  const messages = page.locator('[data-messenger-bubble]')
  const matrixOnly = messages.filter({ hasText: 'Nice work @channel' })
  await expect(matrixOnly.getByText('Sent to Matrix', { exact: true })).toBeVisible()
  const sent = messages.filter({ hasText: 'Confirmed by bridge' })
  await expect(sent.getByText('Sent to Teams', { exact: true })).toBeVisible()
  await expect(sent.getByRole('button', { name: 'Read; show receipts' })).toHaveCount(0)
  const delivered = messages.filter({ hasText: 'Delivered to recipient' })
  await expect(delivered.getByText('Delivered in Teams', { exact: true })).toBeVisible()
  await expect(delivered.getByRole('button', { name: 'Read; show receipts' })).toHaveCount(0)
  const read = messages.filter({ hasText: 'Opened by recipient' }).getByRole('button', { name: 'Read; show receipts' })
  await expect(read).toHaveText('Read')
  await read.click()
  await expect(page.getByText('Read receipts', { exact: true })).toBeVisible()
  await expect(page.getByRole('dialog').getByText('Carol', { exact: true })).toBeVisible()
})

test('loading earlier Teams messages keeps the conversation viewport stable', async ({ page }) => {
  let finishLoading!: () => void
  const earlier = new Promise<void>(resolve => { finishLoading = resolve })
  await mount(page, '!general:test', 'Teams', earlier)
  const viewport = page.locator('[data-conversation-viewport]')
  const message = page.getByRole('log', { name: 'Messages' }).getByText('Deploy done', { exact: true })
  await expect(message).toBeVisible()
  const before = await viewport.boundingBox()
  const messageBefore = await message.boundingBox()
  await page.getByRole('button', { name: 'Load earlier messages' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Loading earlier messages' })).toBeVisible()
  const during = await viewport.boundingBox()
  expect(during).toEqual(before)
  expect(await message.boundingBox()).toEqual(messageBefore)
  finishLoading()
  await expect(page.getByRole('status').filter({ hasText: 'Loading earlier messages' })).toHaveCount(0)
  expect(await viewport.boundingBox()).toEqual(before)
  expect(await message.boundingBox()).toEqual(messageBefore)
})
