import { expect, test, type WebSocketRoute } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://127.0.0.1:8100'

test('a stale queue item is not sent again when the UI WebSocket disconnects', async ({ page, request }) => {
  test.setTimeout(60_000)
  const credentials = { username: 'queue-delivery-e2e', password: 'queue-delivery-test-password' }
  let auth = await request.post(`${API_URL}/api/auth/login`, { data: credentials })
  if (!auth.ok()) auth = await request.post(`${API_URL}/api/auth/register`, { data: credentials })
  expect(auth.ok(), await auth.text()).toBeTruthy()
  const { access_token: token } = await auth.json()
  const headers = { Authorization: `Bearer ${token}` }
  const created = await request.post(`${API_URL}/api/sessions`, { headers, data: { name: 'Stale queued delivery' } })
  expect(created.ok()).toBeTruthy()
  const { id: sessionId } = await created.json()
  await page.addInitScript(({ token, api }) => {
    localStorage.setItem('jait-auth-token', token)
    sessionStorage.setItem('jait-auth-token', token)
    localStorage.setItem('token', token)
    localStorage.setItem('jait-gateway-url', api)
  }, { token, api: API_URL })
  let uiSocket: WebSocketRoute | undefined
  await page.routeWebSocket(() => true, (socket) => {
    const server = socket.connectToServer()
    server.onMessage((message) => {
      const event = JSON.parse(String(message))
      if (event.type === 'ui.full-state' && event.sessionId === sessionId) uiSocket = socket
      socket.send(message)
    })
  })
  const snapshot = { sessionId, streaming: false, seq: 0, total: 2, hasMore: false,
    messages: [{ id: 'delivered-user', role: 'user', content: 'Earlier task' },
      { id: 'delivered-assistant', role: 'assistant', content: 'Earlier task completed' }] }
  await page.route(`**/api/sessions/${sessionId}/messages**`, (route) => route.fulfill({ json: snapshot }))
  await page.route(`**/api/sessions/${sessionId}/events**`, (route) => route.fulfill({
    contentType: 'text/event-stream', body: `data: ${JSON.stringify({ type: 'snapshot', ...snapshot })}\n\n`,
  }))
  await page.route('**/api/consent/pending/**', (route) => route.fulfill({ json: { requests: [] } }))
  const posts: unknown[] = []
  await page.route('**/api/chat', async (route) => {
    posts.push(route.request().postDataJSON())
    await route.fulfill({ status: 503, json: { error: 'Unexpected duplicate send' } })
  })
  await page.goto(`/chat?sessionId=${sessionId}`)
  await expect(page.getByTestId('chat-composer')).toBeVisible()
  await expect.poll(() => Boolean(uiSocket)).toBe(true)
  // Model a delayed UI snapshot of an item the gateway already consumed.
  // No new user send or persisted queue item exists at the gateway.
  uiSocket!.send(JSON.stringify({
    type: 'ui.state-sync', sessionId, timestamp: new Date().toISOString(),
    payload: { key: 'queued_messages', value: [
      { id: 'q-already-delivered', content: 'Already delivered queue item', queuedAt: Date.now() },
    ] },
  }))
  await expect(page.getByText('Already delivered queue item', { exact: true })).toBeVisible()
  expect(posts).toHaveLength(0)
  uiSocket!.close({ code: 1011, reason: 'Simulated lost UI connection' })
  await page.waitForTimeout(700)
  expect(posts, 'WS loss must not trigger a fallback POST for a stale queue item').toHaveLength(0)
})
