import { expect, test, type WebSocketRoute } from '@playwright/test'
import { registerTestUser } from './helpers/agent-user'

const API_URL = process.env.API_URL || 'http://127.0.0.1:8100'

test('shows live approval icons for background chats and clears them after reconnect', async ({ page, request }) => {
  test.setTimeout(45_000)
  const username = `approval-icons-${Date.now()}`
  const password = 'supersecret123'
  const registration = await registerTestUser(request, API_URL, { data: { username, password } })
  expect(registration.ok()).toBeTruthy()
  const { access_token: token } = await registration.json()
  const headers = { Authorization: `Bearer ${token}` }
  const projectResponse = await request.post(`${API_URL}/api/projects`, {
    headers, data: { kind: 'folder', title: 'Approval indicator project' },
  })
  expect(projectResponse.ok()).toBeTruthy()
  const project = await projectResponse.json()
  const chatResponse = await request.post(`${API_URL}/api/projects/${project.id}/sessions`, {
    headers, data: { name: 'Background approval chat' },
  })
  expect(chatResponse.ok()).toBeTruthy()
  const chat = await chatResponse.json()

  // Forward the real app socket; inject only approval state so no tools execute.
  const sockets: WebSocketRoute[] = []
  let pending: Array<{ id: string; sessionId: string }> = []
  await page.routeWebSocket('**/ws?*', (socket) => {
    sockets.push(socket)
    const server = socket.connectToServer()
    server.onMessage((message) => {
      const event = JSON.parse(String(message))
      if (event.type === 'consent.pending-snapshot') {
        socket.send(JSON.stringify({ ...event, payload: { requests: pending } }))
      } else socket.send(message)
    })
  })
  await page.addInitScript(({ apiUrl, authToken }) => {
    localStorage.setItem('jait-gateway-url', apiUrl)
    localStorage.setItem('jait-auth-token', authToken)
    sessionStorage.setItem('jait-auth-token', authToken)
    localStorage.setItem('jait.viewMode', 'developer')
  }, { apiUrl: API_URL, authToken: token })
  await page.context().addCookies([{ name: 'jait_token', value: token, url: API_URL, httpOnly: true, sameSite: 'Lax' }])
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const toggle = page.getByRole('button', { name: 'Projects & Chats', exact: true })
  await expect(toggle).toBeVisible({ timeout: 20_000 })
  if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click()
  const sidebar = page.locator('aside').filter({ has: page.getByText('Approval indicator project', { exact: true }) })
  await expect(sidebar.getByText('Background approval chat', { exact: true })).toBeVisible()
  const waiting = sidebar.locator('[aria-label="Waiting for approval"]')
  const projectWaiting = sidebar.locator('[aria-label="Chat waiting for approval"]')
  await expect(waiting).toHaveCount(0)
  const send = (type: string, payload: unknown) => {
    for (const socket of sockets) socket.send(JSON.stringify({ type, sessionId: chat.id, timestamp: new Date().toISOString(), payload }))
  }
  pending = [{ id: 'approval-1', sessionId: chat.id }, { id: 'approval-2', sessionId: chat.id }]
  send('session.streaming', { sessionId: chat.id, streaming: true })
  for (const item of pending) send('consent.required', item)
  await expect(waiting).toHaveCount(1)
  await expect(projectWaiting).toHaveCount(1)
  send('consent.resolved', { requestId: 'approval-1', approved: true })
  pending = pending.slice(1)
  await expect(waiting).toHaveCount(1)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(waiting).toHaveCount(1)
  send('consent.resolved', { requestId: 'approval-2', approved: false, decidedVia: 'timeout' })
  pending = []
  await expect(waiting).toHaveCount(0)
  await expect(projectWaiting).toHaveCount(0)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(waiting).toHaveCount(0)
})
