import { test, expect } from '@playwright/test'

for (const width of [1280, 390]) {
  test(`Agents keeps one compact header and switchable group chats at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    const profiles = ['Nova', 'Atlas'].map((name, index) => ({
      id: 'agent-' + index, name, avatar: name, providerId: 'jait', persona: 'A reusable teammate',
      requiresApproval: true, paused: false, skillIds: [], repositoryIds: [], allowedTools: [], chatSessionId: 'work-' + index,
      schedule: { kind: 'adaptive', rules: '' }, notificationChannels: [], notificationEvents: [], tasks: [],
    }))
    const rooms = ['Design team', 'Security team'].map((name, index) => ({
      id: 'room-' + index, name, rootAgentId: profiles[index].id,
    }))
    let running = true
    const writes: string[] = []
    await page.addInitScript(() => { localStorage.setItem('jait-auth-token', 'fixture-token') })
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname
      let json: unknown = {}
      if (path === '/api/persona-agents') json = { agents: profiles }
      else if (path === '/api/team-rooms') json = { rooms }
      else if (path.startsWith('/api/team-rooms/')) {
        const room = rooms.find(room => room.id === path.split('/')[3])!
        if (route.request().method() === 'POST') {
          writes.push(path)
          json = { message: { id: 'sent' } }
        } else json = { room, members: [profiles[rooms.indexOf(room)]], messages: [{
          id: room.id + '-message', sender: { kind: 'agent', id: room.rootAgentId, name: room.name, avatar: 'Nova' },
          content: room.name + ' history', kind: 'discussion', recipientIds: [], createdAt: '2026-10-10T12:00:00Z',
        }], deliveries: [] }
      } else if (path === '/api/threads') json = { threads: [], hasMore: false }
      else if (path.endsWith('/runtime')) json = { running: running && path.includes('work-0') }
      else if (path === '/api/auth/me') json = { id: 'fixture-user', username: 'Fixture' }
      else if (path === '/api/auth/settings') { await route.fulfill({ status: 404, json: {} }); return }
      else if (path === '/api/providers') json = { providers: [], remoteProviders: [] }
      else if (path.includes('models')) json = { models: [] }
      else if (path.includes('skills')) json = []
      await route.fulfill({ json })
    })
    await page.goto('/agent-continuation.html', { waitUntil: 'domcontentloaded' })
    const header = page.locator('header')
    await expect(header).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    expect((await header.boundingBox())!.height).toBeLessThanOrEqual(48)
    const graph = page.getByLabel('Agent reporting graph')
    await expect(graph).toBeVisible()
    const panel = page.getByRole('complementary', { name: 'Group chats', exact: true })
    if (width < 640) await page.getByRole('button', { name: 'Chats', exact: true }).click()
    await expect(panel).toBeVisible()
    if (width >= 640) {
      await expect(graph).toBeVisible()
      expect((await graph.boundingBox())!.width).toBeGreaterThan((await panel.boundingBox())!.width)
      expect((await graph.boundingBox())!.height).toBeGreaterThan(600)
    }
    const designTab = panel.getByRole('button', { name: 'Design team', exact: true })
    await expect(designTab.locator('.agent-creature-working')).toHaveCount(1)
    running = false
    await expect(designTab.locator('.agent-creature-working')).toHaveCount(0)
    const input = panel.locator('[contenteditable="true"]')
    await expect(panel.getByText('Design team history')).toBeVisible()
    await input.fill('Design draft')
    await panel.getByRole('button', { name: 'Security team', exact: true }).click()
    await expect(panel.getByText('Security team history')).toBeVisible()
    await expect(input).toBeEmpty()
    await input.fill('Security draft')
    await panel.getByRole('button', { name: 'Design team', exact: true }).click()
    await expect(input).toHaveText('Design draft')
    await panel.getByRole('button', { name: 'Security team', exact: true }).click()
    await expect(input).toHaveText('Security draft')
    await panel.getByRole('button', { name: 'Send message', exact: true }).click()
    await expect.poll(() => writes).toEqual(['/api/team-rooms/room-1/messages'])
    await page.screenshot({ path: `/tmp/jait-agents-group-panel-${width}.png` })
    if (width < 640) {
      await page.getByRole('button', { name: 'Graph', exact: true }).click()
      await expect(panel).toHaveCount(0)
      await expect(graph).toBeVisible()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.getByRole('button', { name: 'Open Nova', exact: true }).click()
    await expect(page.getByRole('complementary', { name: 'Agent details' })).toBeVisible()
    await expect(page.locator('header')).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  })
}
