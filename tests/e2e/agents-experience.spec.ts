import { test, expect, type Page, type APIRequestContext, type WebSocketRoute } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://127.0.0.1:8100'

async function openAgents(page: Page, request: APIRequestContext) {
  const registration = await request.post(`${API_URL}/api/auth/register`, {
    data: { username: `agents-ui-${Date.now()}-${Math.random().toString(36).slice(2)}`, password: 'agents-ui-test-password' },
  })
  expect(registration.ok()).toBeTruthy()
  const { access_token: token } = await registration.json()
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
  const row = page.getByTestId('agent-row')
  await expect(row.getByRole('button', { name: 'Stop Researcher' })).toBeEnabled()
  await expect(row.getByLabel('Running time')).toHaveText(/^2:\d{2}$/)
  await expect(row.locator('svg.agent-creature')).toHaveClass(/agent-creature-working/)
  await page.screenshot({ path: '../../.jait/agents-overview.png', fullPage: true })
  await page.reload({ waitUntil: 'domcontentloaded' })
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
  await page.route(`**/api/threads/${thread.id}/start`, async (route) => {
    resumed = route.request().postDataJSON().message.includes('Continue the stopped task')
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
