import { test, expect, type Page, type APIRequestContext, type WebSocketRoute } from '@playwright/test'

import { registerAgentTestUser } from './helpers/agent-user'

const API_URL = process.env.API_URL || 'http://127.0.0.1:8100'

async function openAgents(page: Page, request: APIRequestContext) {
  const token = await registerAgentTestUser(request, API_URL, `agents-ui-${Date.now()}-${Math.random().toString(36).slice(2)}`, 'agents-ui-test-password')
  await page.context().addCookies([{ name: 'jait_token', value: token, url: API_URL, httpOnly: true, sameSite: 'Lax' }])
  await page.addInitScript(({ token, api }) => {
    localStorage.setItem('jait-auth-token', token)
    sessionStorage.setItem('jait-auth-token', token)
    localStorage.setItem('token', token)
    localStorage.setItem('jait-gateway-url', api)
  }, { token, api: API_URL })
  await page.addLocatorHandler(page.getByText('A node needs your permission', { exact: true }), async () => {
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click()
  })
  await page.goto('/agents', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'New agent' })).toBeVisible()
  await expect(page.getByText('Threads use auto-approve by default. Supervised runs ask for approval.')).toBeVisible()
  return token as string
}

async function createAgent(page: Page) {
  await page.getByRole('button', { name: 'New agent' }).click()
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Researcher')
  await page.getByRole('textbox', { name: 'Role and responsibilities' }).fill('Create concise research reports')
  const saved = page.waitForResponse((response) =>
    response.url().includes('/api/persona-agents/') &&
    response.request().method() === 'PUT' &&
    response.ok() &&
    response.request().postData()?.includes('"name":"Researcher"') === true,
  )
  await page.getByRole('button', { name: 'Create agent', exact: true }).click()
  const response = await saved
  await expect(page.getByRole('heading', { name: 'Researcher' })).toBeVisible()
  return response.request().postDataJSON() as { id: string; skillIds: string[]; usesAllSkills?: boolean }
}

test('agent deletion requires the exact name', async ({ page, request }) => {
  await openAgents(page, request)
  await createAgent(page)

  await page.getByRole('button', { name: 'Delete agent' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'Delete Researcher?' })).toBeVisible()
  await expect(dialog.getByText('Researcher', { exact: true })).toBeVisible()
  const confirm = dialog.getByRole('button', { name: 'Delete agent' })
  await expect(confirm).toBeDisabled()
  await dialog.getByRole('textbox', { name: 'Type agent name to confirm' }).fill('researcher')
  await expect(confirm).toBeDisabled()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Researcher' })).toBeVisible()

  await page.getByRole('button', { name: 'Delete agent' }).click()
  await dialog.getByRole('textbox', { name: 'Type agent name to confirm' }).fill('Researcher')
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Researcher/ })).toHaveCount(0)
})

test('agent chat creates a regular session and starts with all enabled skills', async ({ page, request }) => {
  const token = await openAgents(page, request)
  const skillsResponse = await request.get(`${API_URL}/api/skills`, { headers: { Authorization: `Bearer ${token}` } })
  expect(skillsResponse.ok()).toBeTruthy()
  const enabledSkillIds = ((await skillsResponse.json()) as Array<{ id: string; enabled: boolean }>).filter((skill) => skill.enabled).map((skill) => skill.id)
  const agent = await createAgent(page)
  expect(agent.usesAllSkills).toBe(true)
  expect(agent.skillIds).toEqual(enabledSkillIds)

  let threadCreates = 0
  page.on('request', (outbound) => {
    if (outbound.url().endsWith('/api/threads') && outbound.method() === 'POST') threadCreates += 1
  })
  await page.route('**/api/chat', async (route) => {
    await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"test response"}' })
  })
  await page.locator('[data-testid="chat-composer"] [contenteditable="true"]').fill('Hello Researcher')
  const sessionCreated = page.waitForResponse((response) => response.url().endsWith('/api/sessions') && response.request().method() === 'POST' && response.ok())
  const profileUpdated = page.waitForResponse((response) => response.url().includes('/api/persona-agents/') && response.request().method() === 'PUT' && response.request().postData()?.includes('chatSessionId') === true)
  await page.getByRole('button', { name: 'Send message' }).click()
  const session = await (await sessionCreated).json() as { id: string }
  expect((await profileUpdated).ok()).toBeTruthy()
  expect(session.id).toBeTruthy()
  expect(threadCreates).toBe(0)
})

test('agent overview uses creatures and play opens task selection independently', async ({ page, request }) => {
  await openAgents(page, request)
  await createAgent(page)
  await page.getByRole('button', { name: 'All agents' }).click()
  await page.getByRole('button', { name: 'List', exact: true }).click()
  const row = page.getByTestId('agent-row')
  await expect(row.locator('svg.agent-creature')).toBeVisible()
  await expect(row.getByText('Ready', { exact: true })).toHaveCount(0)
  await row.getByRole('button', { name: 'Choose task for Researcher' }).click()
  await expect(page.getByRole('heading', { name: 'Tasks & runs', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'All agents' }).click()
  await row.getByRole('button', { name: 'Open Researcher' }).click()
  await expect(page.getByTestId('chat-composer')).toBeVisible()
})

test('agent overview restores elapsed time on reload and flips stop to play', async ({ page, request }) => {
  const token = await openAgents(page, request)
  const agent = await createAgent(page)
  const headers = { Authorization: `Bearer ${token}` }
  const response = await request.post(`${API_URL}/api/sessions`, { headers, data: { name: 'Agent runtime test' } })
  expect(response.ok()).toBeTruthy()
  const session = await response.json() as { id: string }
  expect((await request.put(`${API_URL}/api/persona-agents/${agent.id}`, { headers, data: { ...agent, chatSessionId: session.id } })).ok()).toBeTruthy()
  let running = true
  let stopped = false
  const startedAt = new Date(Date.now() - 125_000).toISOString()
  await page.route(`**/api/sessions/${session.id}/runtime`, (route) => route.fulfill({ json: { running, startedAt: running ? startedAt : null } }))
  await page.route(`**/api/sessions/${session.id}/cancel`, async (route) => {
    stopped = true
    running = false
    await route.fulfill({ json: { ok: true, cancelled: true } })
  })
  await page.getByRole('button', { name: 'All agents' }).click()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'List', exact: true }).click()
  const row = page.getByTestId('agent-row')
  await expect(row.getByRole('button', { name: 'Stop Researcher' })).toBeEnabled()
  await expect(row.getByLabel('Running time')).toHaveText(/^2:\d{2}$/)
  await expect(row.locator('svg.agent-creature')).toHaveClass(/agent-creature-working/)
  await page.screenshot({ path: '../../.jait/agents-overview.png', fullPage: true })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await expect(row.getByLabel('Running time')).toHaveText(/^2:\d{2}$/)
  await row.getByRole('button', { name: 'Stop Researcher' }).click()
  await expect.poll(() => stopped).toBe(true)
  await expect(row.getByRole('button', { name: 'Choose task for Researcher' })).toBeEnabled()
  await expect(row.getByLabel('Running time')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await row.locator('.agent-creature-eyes').evaluate((eyes) => getComputedStyle(eyes).animationName)).toBe('none')
})

test('stopped task resumes from its row and active tasks stop independently of latest task', async ({ page, request }) => {
  const token = await openAgents(page, request)
  const agent = await createAgent(page)
  const response = await request.post(`${API_URL}/api/threads`, { headers: { Authorization: `Bearer ${token}` }, data: { title: 'Write report', providerId: 'jait', personaAgentId: agent.id } })
  expect(response.ok()).toBeTruthy()
  const thread = await response.json()
  let status = 'interrupted'
  let resumed = false
  let stopped = false
  const startedAt = new Date(Date.now() - 65_000).toISOString()
  const sockets: WebSocketRoute[] = []
  const sendSnapshot = (socket: WebSocketRoute) => socket.send(JSON.stringify({
    type: 'thread.updated', sessionId: '', timestamp: new Date().toISOString(),
    payload: { threads: [
      { ...thread, status, updatedAt: startedAt },
      // A newer completed task must not hide an older active task.
      ...(status === 'running' ? [{ ...thread, id: 'newer-completed-task', status: 'completed', title: 'Completed task', updatedAt: new Date().toISOString() }] : []),
    ], hasMore: false, serverTime: new Date().toISOString() },
  }))
  await page.routeWebSocket(() => true, (socket) => {
    sockets.push(socket)
    const server = socket.connectToServer()
    server.onMessage((message) => {
      const event = JSON.parse(String(message))
      if (event.type?.startsWith('thread.')) sendSnapshot(socket)
      else socket.send(message)
    })
  })
  await page.route(`**/api/threads/${thread.id}/runtime`, (route) => route.fulfill({ json: { running: status === 'running', startedAt } }))
  await page.route(`**/api/threads/${thread.id}/resume`, async (route) => {
    resumed = route.request().method() === 'POST'
    status = 'running'
    sockets.forEach(sendSnapshot)
    await route.fulfill({ json: { ...thread, status } })
  })
  await page.route(`**/api/threads/${thread.id}/stop`, async (route) => {
    stopped = true
    status = 'interrupted'
    sockets.forEach(sendSnapshot)
    await route.fulfill({ json: { ok: true } })
  })
  await page.getByRole('button', { name: 'All agents' }).click()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'List', exact: true }).click()
  const row = page.getByTestId('agent-row')
  await row.getByRole('button', { name: 'Resume Researcher' }).click()
  await expect.poll(() => resumed).toBe(true)
  await expect(row.getByRole('button', { name: 'Stop Researcher' })).toBeEnabled()
  await expect(row.getByLabel('Running time')).toHaveText(/^1:\d{2}$/)
  await expect(row.getByText('Write report', { exact: true })).toBeVisible()
  await row.getByRole('button', { name: 'Stop Researcher' }).click()
  await expect.poll(() => stopped).toBe(true)
  await expect(row.getByRole('button', { name: 'Resume Researcher' })).toBeEnabled()
  await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible()
})

test('agent list edits persist and graph shows real runtime and reporting links', async ({ page, request }) => {
  await openAgents(page, request)
  await createAgent(page)
  await page.getByRole('button', { name: 'All agents' }).click()
  await page.getByRole('button', { name: 'List', exact: true }).click()
  const row = page.getByTestId('agent-row')
  await row.getByRole('button', { name: 'Change provider and model for Researcher' }).click()
  await expect(row.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)
  await expect(row.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)
  const saved = page.waitForResponse(response => response.url().includes('/api/persona-agents/') && response.request().method() === 'PUT' && response.ok())
  await row.getByRole('button', { name: /^Provider / }).click()
  await page.getByRole('listbox', { name: 'Providers', exact: true }).getByRole('option').filter({ hasText: 'Pi' }).click()
  const profile = await (await saved).json()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await expect(row.getByRole('button', { name: 'Change provider and model for Researcher' })).toHaveAttribute('title', profile.providerId + ' · ' + (profile.model || 'Default model'))
  await page.getByRole('button', { name: 'Graph', exact: true }).click()
  const canvas = page.getByLabel('Agent reporting graph').locator('canvas').first()
  await expect(canvas).toBeVisible()
  const graphNode = page.getByTestId('agent-graph-node')
  await expect(graphNode.locator('svg.agent-creature')).toBeVisible()
  await expect(graphNode.getByLabel('0 running tasks')).toHaveCount(0)
  await graphNode.getByRole('button', { name: 'Open Researcher', exact: true }).click()
  const sidebar = page.getByRole('complementary', { name: 'Agent details' })
  await expect(sidebar).toBeVisible()
  await expect(sidebar.getByTestId('chat-composer')).toBeVisible()
  await expect(canvas).toBeVisible()
  const graphBounds = await canvas.boundingBox()
  const sidebarBounds = await sidebar.boundingBox()
  expect(graphBounds!.x + graphBounds!.width).toBeLessThanOrEqual(sidebarBounds!.x + 1)
  await sidebar.getByRole('button', { name: 'Profile', exact: true }).click()
  await expect(sidebar.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Researcher')
  await page.screenshot({ path: 'test-results/agents-graph.png', fullPage: true })
  await page.getByRole('button', { name: 'All agents' }).click()
  await page.getByRole('button', { name: 'List', exact: true }).click()
  await expect(row.getByRole('button', { name: 'Open Researcher' })).toBeVisible()
})

test('agent list shows save failure without claiming a persisted model', async ({ page, request }) => {
  await openAgents(page, request)
  await createAgent(page)
  await page.getByRole('button', { name: 'All agents' }).click()
  await page.route('**/api/persona-agents/*', route => route.request().method() === 'PUT' ? route.fulfill({ status: 500, json: { error: 'Save failed' } }) : route.continue())
  await page.getByRole('button', { name: 'List', exact: true }).click()
  const row = page.getByTestId('agent-row')
  await row.getByRole('button', { name: 'Change provider and model for Researcher' }).click()
  await row.getByRole('button', { name: /^Provider / }).click()
  await page.getByRole('listbox', { name: 'Providers', exact: true }).getByRole('option').filter({ hasText: 'Pi' }).click()
  await expect(row.getByRole('alert')).toBeVisible()
  await expect(row.getByRole('button', { name: 'Change provider and model for Researcher' })).toBeEnabled()
})


test('agent graph fills the page by default and compact controls open the sidebar', async ({ page, request }) => {
  await openAgents(page, request)
  await createAgent(page)
  await page.getByRole('button', { name: 'All agents' }).click()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Graph', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const graph = page.getByLabel('Agent reporting graph')
  await expect(graph.locator('canvas:not([aria-hidden])')).toBeVisible()
  const bounds = await graph.boundingBox()
  expect(bounds!.height).toBeGreaterThan(400)
  const node = page.getByTestId('agent-graph-node')
  await expect(node.getByRole('button', { name: 'Choose task for Researcher' })).toBeEnabled()
  await expect(node.getByLabel('0 running tasks')).toHaveCount(0)
  await node.getByRole('button', { name: 'Choose task for Researcher' }).click()
  const sidebar = page.getByRole('complementary', { name: 'Agent details' })
  await expect(sidebar.getByRole('heading', { name: 'Tasks & runs', exact: true })).toBeVisible()
  await expect(graph.locator('canvas:not([aria-hidden])')).toBeVisible()
  await sidebar.getByRole('button', { name: 'All agents' }).click()
  await expect(sidebar).toHaveCount(0)
  await page.goto('/')
  await expect(page.getByLabel('Chat recipient', { exact: true })).toHaveCount(0)
})


test('graph shows a spinning count only while running and stops the active chat', async ({ page, request }) => {
  const token = await openAgents(page, request)
  const agent = await createAgent(page)
  const headers = { Authorization: `Bearer ${token}` }
  const response = await request.post(`${API_URL}/api/sessions`, { headers, data: { name: 'Graph runtime' } })
  expect(response.ok()).toBeTruthy()
  const session = await response.json() as { id: string }
  expect((await request.put(`${API_URL}/api/persona-agents/${agent.id}`, { headers, data: { ...agent, chatSessionId: session.id } })).ok()).toBeTruthy()
  let running = true
  await page.route(`**/api/sessions/${session.id}/runtime`, route => route.fulfill({ json: { running, startedAt: running ? new Date().toISOString() : null } }))
  await page.route(`**/api/sessions/${session.id}/cancel`, async route => {
    running = false
    await route.fulfill({ json: { ok: true, cancelled: true } })
  })
  await page.getByRole('button', { name: 'All agents' }).click()
  await page.reload({ waitUntil: 'domcontentloaded' })
  const node = page.getByTestId('agent-graph-node')
  await expect(node.getByLabel('1 running tasks')).toHaveText('1')
  await expect(node.getByLabel('1 running tasks').locator('.animate-spin')).toBeVisible()
  await node.getByRole('button', { name: 'Stop Researcher' }).click()
  await expect(node.getByLabel('1 running tasks')).toHaveCount(0)
  await expect(node.getByRole('button', { name: 'Choose task for Researcher' })).toBeEnabled()
})

test('agent graph keeps a larger team inside the viewport on entry and resize', async ({ page, request }) => {
  await openAgents(page, request)
  const agent = await createAgent(page)
  const team = Array.from({ length: 8 }, (_, index) => ({
    ...agent, id: 'fit-agent-' + index, name: 'Teammate ' + index,
    reportsToId: index ? 'fit-agent-0' : null,
  }))
  await page.route('**/api/persona-agents', route => route.fulfill({ json: { agents: team } }))
  await page.getByRole('button', { name: 'All agents' }).click()
  await page.reload({ waitUntil: 'domcontentloaded' })
  const graph = page.getByLabel('Agent reporting graph')
  await expect(page.getByTestId('agent-graph-node')).toHaveCount(8)
  const allCardsFit = async () => graph.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    return [...element.querySelectorAll('[data-testid="agent-graph-node"]')].every(card => {
      const rect = card.getBoundingClientRect()
      return rect.left >= bounds.left && rect.right <= bounds.right &&
        rect.top >= bounds.top && rect.bottom <= bounds.bottom
    })
  })
  await expect.poll(allCardsFit, { timeout: 10000 }).toBe(true)
  await page.setViewportSize({ width: 1000, height: 720 })
  await expect.poll(allCardsFit, { timeout: 10000 }).toBe(true)
})
