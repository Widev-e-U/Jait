import { test, expect } from '@playwright/test'
import path from 'node:path'

const shotsDir = path.resolve(__dirname, '../../.jait/shots')

for (const width of [1280, 390]) {
  test(`team chats keep histories and drafts separate at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width, height: 844 })
    const profiles = ['Nova', 'Atlas'].map((name, index) => ({
      id: 'agent-' + index, name, avatar: name, providerId: 'jait', persona: 'A reusable teammate',
      requiresApproval: true, paused: false, skillIds: [], repositoryIds: [], allowedTools: [], chatSessionId: 'work-' + index,
      schedule: { kind: 'adaptive', rules: '' }, notificationChannels: [], notificationEvents: [], tasks: [],
    }))
    const rooms = ['Design team', 'Security team'].map((name, index) => ({
      id: 'room-' + index, name, rootAgentId: profiles[index].id, memberIds: [profiles[index].id],
    }))
    const writes: string[] = []
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/api/**', async route => {
      const pathname = new URL(route.request().url()).pathname
      let json: unknown = {}
      if (pathname === '/api/persona-agents') json = { agents: profiles }
      else if (pathname === '/api/team-rooms') json = { rooms }
      else if (pathname.startsWith('/api/team-rooms/')) {
        const room = rooms.find(room => room.id === pathname.split('/')[3])!
        if (route.request().method() === 'POST') {
          writes.push(pathname)
          json = { message: { id: 'sent' } }
        } else json = { room, members: [profiles[rooms.indexOf(room)]], messages: [{
          id: room.id + '-message', sender: { kind: 'agent', id: room.rootAgentId, name: room.name, avatar: 'Nova' },
          content: room.name + ' history', kind: 'discussion', recipientIds: [], createdAt: '2026-10-10T12:00:00Z',
        }], deliveries: [] }
      } else if (pathname === '/api/threads') json = { threads: [], hasMore: false }
      else if (pathname.endsWith('/runtime')) json = { running: false }
      else if (pathname === '/api/auth/me') json = { id: 'fixture-user', username: 'Fixture' }
      else if (pathname === '/api/providers') json = { providers: [], remoteProviders: [] }
      else if (pathname.includes('models')) json = { models: [] }
      else if (pathname.includes('skills')) json = []
      await route.fulfill({ json })
    })
    await page.goto('/team-chat.html?panelFixture=1')
    await page.getByRole('button', { name: 'Team Chats', exact: true }).click()
    const panel = page.getByRole('region', { name: 'Team chats', exact: true })
    const list = page.getByRole('navigation', { name: 'Team chat list' })
    await expect(list.getByRole('button')).toHaveCount(2)
    await expect(page.getByTestId('chat-composer')).toHaveCount(0)
    const openRoom = async (name: string) => {
      if (width < 640 && await page.getByRole('button', { name: 'Back to team chats', exact: true }).count()) {
        await page.getByRole('button', { name: 'Back to team chats', exact: true }).click()
      }
      await list.getByRole('button').filter({ hasText: name }).click()
      await expect(panel.getByText(name + ' history', { exact: true })).toBeVisible()
    }
    await openRoom('Design team')
    const input = panel.getByTestId('chat-composer').getByRole('textbox')
    await input.fill('Design draft')
    await openRoom('Security team')
    await expect(input).toBeEmpty()
    await expect(panel.getByText('Design team history', { exact: true })).toHaveCount(0)
    await input.fill('Security draft')
    await openRoom('Design team')
    await expect(input).toHaveText('Design draft')
    await openRoom('Security team')
    await expect(input).toHaveText('Security draft')
    await panel.getByRole('button', { name: 'Send message', exact: true }).click()
    await expect.poll(() => writes).toEqual(['/api/team-rooms/room-1/messages'])
    await page.screenshot({ path: path.join(shotsDir, `team-room-drafts-${width}.png`) })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.reload()
    await expect(panel.getByRole('heading', { name: 'Security team', exact: true })).toBeVisible()
    expect(errors).toEqual([])
  })
}
