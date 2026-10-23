import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

test.use({ screenshot: 'off' })

const base = { encrypted: false, unableToDecrypt: false, pending: false, failed: false, reactions: [] as any[] }

/**
 * Team platforms arrive as a Matrix space (the team) plus channel rooms. The
 * page must group channels under their team and open channels with a
 * channel-flavoured header, while plain chats keep the normal transcript.
 */
async function mount(page: Page, roomId = '!general:test', service = 'Slack') {
  const calls: any[] = []
  const snapshot = {
    status: 'ready', error: null, notifications: false, assistantAccess: false, hasEarlier: false,
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
    if (url.pathname.endsWith('/command')) { calls.push(route.request().postDataJSON()); return route.fulfill({ json: { ok: true } }) }
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
  await page.getByRole('combobox', { name: 'Filter by service' }).click()
  await expect(page.getByRole('option', { name: 'WhatsApp', exact: true })).toBeVisible()
  await page.getByRole('option', { name: 'Teams', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Conversation general' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Conversation Bob' })).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'Filter by service' })).toHaveText('Teams')
})
