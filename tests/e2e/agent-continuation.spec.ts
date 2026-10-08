import { test, expect, type Page } from '@playwright/test'

async function fixture(page: Page) {
  const profiles = ['Nova', 'Atlas'].map((name, index) => ({
    id: `agent-${index}`, name, avatar: name, providerId: 'codex', model: 'old-model',
    persona: 'Finish your assigned task', requiresApproval: true, paused: false,
    skillIds: [], repositoryIds: [], allowedTools: [], usesAllSkills: false,
    schedule: { kind: 'adaptive', rules: '' }, notificationChannels: [], notificationEvents: [], tasks: [],
  }))
  const threads = profiles.map((agent, index) => ({
    id: `thread-${index}`, personaAgentId: agent.id, title: 'Fix parser', providerId: 'codex',
    model: 'old-model', kind: 'delivery', status: index === 0 ? 'error' : 'interrupted',
    error: index === 0 ? 'Usage limit reached' : null, updatedAt: '2026-10-07T10:00:00Z',
  }))
  const resumed: string[] = []
  await page.addInitScript(() => { localStorage.setItem('jait-auth-token', 'fixture-token') })
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    let json: unknown = {}
    if (path === '/api/persona-agents') json = { agents: profiles }
    else if (path.startsWith('/api/persona-agents/') && request.method() === 'PUT') {
      const changed = request.postDataJSON()
      const index = profiles.findIndex(agent => agent.id === changed.id)
      profiles[index] = changed
      json = changed
    } else if (path === '/api/threads') json = { threads, hasMore: false }
    else if (path.endsWith('/resume')) {
      const id = path.split('/')[3]
      const thread = threads.find(item => item.id === id)!
      resumed.push(id)
      thread.status = 'running'
      thread.error = null
      json = thread
    } else if (path.endsWith('/runtime')) json = { running: false, startedAt: null }
    else if (path === '/api/auth/me') json = { id: 'fixture-user', username: 'Fixture' }
    else if (path === '/api/auth/settings') { await route.fulfill({ status: 404, json: {} }); return }
    else if (path === '/api/team-rooms') json = { rooms: [] }
    else if (path === '/api/providers') json = { providers: [], remoteProviders: [] }
    else if (path.includes('models')) json = { models: [] }
    else if (path.includes('skills')) json = []
    await route.fulfill({ json })
  })
  await page.goto('/agent-continuation.html', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Resume Nova', exact: true })).toBeEnabled()
  return { resumed, profiles }
}

test('play continues failed work and bulk play continues other interrupted agents', async ({ page }) => {
  const { resumed } = await fixture(page)
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await expect(page.getByText('Usage limit reached · change provider/model, then Play', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Resume Nova', exact: true }).click()
  await expect.poll(() => resumed).toEqual(['thread-0'])
  await page.getByRole('button', { name: 'Resume interrupted agents', exact: true }).click()
  await expect.poll(() => resumed).toEqual(['thread-0', 'thread-1'])
  await expect(page.getByRole('button', { name: 'Resume interrupted agents', exact: true })).toHaveCount(0)
})

test('graph has sparse reactive dots and supports dragging without opening details', async ({ page }) => {
  await fixture(page)
  const background = page.getByTestId('agent-wave-background')
  await expect(background).toBeVisible()
  expect(Number(await background.getAttribute('data-dot-count'))).toBeLessThan(750)
  const avatar = page.getByRole('button', { name: 'Open Nova', exact: true })
  // Let the force layout settle before testing a manual drag.
  await page.waitForTimeout(2500)
  const before = (await avatar.boundingBox())!
  const other = (await page.getByRole('button', { name: 'Open Atlas', exact: true }).boundingBox())!
  expect(Math.hypot(before.x - other.x, before.y - other.y)).toBeLessThan(750)
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
  await page.mouse.down()
  await page.mouse.move(before.x + before.width / 2 + 100, before.y + before.height / 2 + 50, { steps: 12 })
  await page.mouse.up()
  await expect(page.getByRole('complementary', { name: 'Agent details' })).toHaveCount(0)
  const after = (await avatar.boundingBox())!
  expect(after.x - before.x).toBeGreaterThan(65)
  await page.screenshot({ path: '../../.jait/agent-wave-continuation.png' })
  await avatar.click()
  await expect(page.getByRole('complementary', { name: 'Agent details' })).toBeVisible()
})

test('reduced motion keeps the graph usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await fixture(page)
  await expect(page.getByTestId('agent-wave-background')).toBeVisible()
  await page.getByRole('button', { name: 'Resume Nova', exact: true }).click()
})
