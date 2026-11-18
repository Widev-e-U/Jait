import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'

const shotsDir = path.resolve(__dirname, '../../.jait/shots')

async function fixture(page: Page) {
  const agent = {
    id: 'interaction-agent', name: 'Nova', avatar: 'Nova', providerId: 'codex', model: 'model-a',
    persona: 'Research and report', requiresApproval: true, paused: false, chatSessionId: 'agent-chat',
    skillIds: [], repositoryIds: [], allowedTools: [], usesAllSkills: false,
    schedule: { kind: 'adaptive', rules: '' }, notificationChannels: [], notificationEvents: [], tasks: [],
  }
  const threads = [
    { id: 'active-run', personaAgentId: agent.id, title: 'Investigate exposure', providerId: 'codex', kind: 'delivery', status: 'running', updatedAt: '2026-10-12T10:00:00Z' },
    { id: 'finished-run', personaAgentId: agent.id, title: 'Previous report', providerId: 'codex', kind: 'delivery', status: 'completed', updatedAt: '2026-10-13T10:00:00Z' },
  ]
  const saves: unknown[] = []
  await page.addInitScript(() => { localStorage.setItem('jait-auth-token', 'fixture-token') })
  await page.route('**/api/**', async route => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    let json: unknown = {}
    if (pathname === '/api/persona-agents') json = { agents: [agent] }
    else if (pathname.startsWith('/api/persona-agents/') && request.method() === 'PUT') {
      const saved = request.postDataJSON()
      saves.push(saved)
      Object.assign(agent, saved)
      json = agent
    } else if (pathname === '/api/threads') json = { threads, hasMore: false }
    else if (pathname.endsWith('/runtime')) json = { running: pathname.includes('active-run') || pathname.includes('agent-chat'), startedAt: '2026-10-13T09:00:00Z' }
    else if (pathname === '/api/auth/me') json = { id: 'fixture-user', username: 'Fixture' }
    else if (pathname === '/api/auth/settings') { await route.fulfill({ status: 404, json: {} }); return }
    else if (pathname === '/api/providers') json = { providers: [{ id: 'codex', name: 'Codex', available: true, isAvailable: true, type: 'codex' }], remoteProviders: [] }
    else if (pathname.includes('models')) json = { models: [{ id: 'model-a', name: 'Model A', isDefault: true }, { id: 'model-b', name: 'Model B' }] }
    else if (pathname === '/api/team-rooms') json = { rooms: [] }
    else if (pathname.includes('skills') || pathname.endsWith('/messages')) json = []
    await route.fulfill({ json })
  })
  await page.goto('/agent-continuation.html', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Open Nova', exact: true })).toBeVisible()
  return { saves }
}

for (const view of ['Graph', 'List'] as const) {
  test(`${view} provider picker opens with one click and reopens after dismissal`, async ({ page }) => {
    const { saves } = await fixture(page)
    await page.getByRole('button', { name: view, exact: true }).click()
    const trigger = page.getByRole('button', { name: 'Change provider and model for Nova' })
    await trigger.click()
    await expect(page.getByRole('listbox', { name: 'Providers', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox', { name: 'Providers', exact: true })).toBeHidden()
    await trigger.click()
    await expect(page.getByRole('listbox', { name: 'Providers', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await trigger.hover()
    await expect(page.locator('[data-slot="tooltip-content"]')).toContainText('Model A')
    await expect(trigger).not.toHaveAttribute('title')
    expect(saves).toEqual([])
  })

  test(`${view} agent opens current runs before task setup and keeps chat accessible`, async ({ page }) => {
    await fixture(page)
    await page.getByRole('button', { name: view, exact: true }).click()
    await page.getByRole('button', { name: 'Open Nova', exact: true }).click()
    const sidebar = page.getByRole('complementary', { name: 'Agent details' })
    await expect(sidebar.getByRole('heading', { name: 'Current runs', exact: true })).toBeVisible()
    const current = sidebar.getByRole('region', { name: 'Current runs' })
    await expect(current).toContainText('Investigate exposure')
    await expect(current).toContainText('Agent chat')
    await expect(current).not.toContainText('Previous report')
    const currentBounds = (await current.boundingBox())!
    const tasksBounds = (await sidebar.getByRole('heading', { name: 'Tasks & runs', exact: true }).boundingBox())!
    expect(currentBounds.y).toBeLessThan(tasksBounds.y)
    await page.screenshot({ path: path.join(shotsDir, `agent-runs-${view.toLowerCase()}.png`) })
    await sidebar.getByRole('button', { name: 'Chat', exact: true }).click()
    await expect(sidebar.getByTestId('chat-composer')).toBeVisible()
  })
}
