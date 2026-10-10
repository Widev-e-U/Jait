import { test, expect } from '@playwright/test'
import { registerAgentTestUser } from './helpers/agent-user'

const API_URL = process.env.API_URL || 'http://127.0.0.1:8100'

test('opening a running thread shows its actual provider and model', async ({ page, request }) => {
  const token = await registerAgentTestUser(request, API_URL, `thread-provider-${Date.now()}`, 'thread-provider-test-password')
  const headers = { Authorization: `Bearer ${token}` }
  const created = await request.post(`${API_URL}/api/threads`, {
    headers,
    data: { title: 'Provider sync regression', providerId: 'jait' },
  })
  expect(created.ok(), await created.text()).toBeTruthy()
  const stored = await created.json()
  // Simulate an already-running worker without launching a provider process.
  const thread = { ...stored, providerId: 'codex', model: 'gpt-6', reasoningEffort: 'high', runtimeMode: 'supervised', status: 'running', providerSessionId: 'fixture-provider-session' }
  await page.route('**/api/threads?*', route => route.fulfill({ json: { threads: [thread], hasMore: false } }))
  await page.route(`**/api/threads/${thread.id}`, route => route.fulfill({ json: thread }))
  await page.route(`**/api/threads/${thread.id}/runtime`, route => route.fulfill({ json: { running: true, startedAt: new Date().toISOString() } }))
  await page.route(/\/api\/providers(?:\?|$)/, route => route.fulfill({ json: {
    providers: [{ id: 'jait', name: 'Jait', available: true, modes: ['full-access', 'supervised'] }, { id: 'codex', name: 'Codex', providerType: 'codex', available: true, modes: ['full-access', 'supervised'] }],
    remoteProviders: [],
  } }))
  await page.route('**/api/providers/*/models*', route => route.fulfill({ json: {
    models: [{ id: 'gpt-6', name: 'gpt-6', reasoningEffortSupported: true }],
  } }))
  await page.routeWebSocket(() => true, socket => {
    const server = socket.connectToServer()
    server.onMessage(message => {
      const event = JSON.parse(String(message))
      if (event.type?.startsWith('thread.')) socket.send(JSON.stringify({
        type: 'thread.updated', sessionId: '', timestamp: new Date().toISOString(),
        payload: { threads: [thread], hasMore: false, serverTime: new Date().toISOString() },
      }))
      else socket.send(message)
    })
  })
  await page.context().addCookies([{ name: 'jait_token', value: token, url: API_URL, httpOnly: true, sameSite: 'Lax' }])
  await page.addInitScript(({ token, api }) => {
    localStorage.setItem('jait-auth-token', token)
    sessionStorage.setItem('jait-auth-token', token)
    localStorage.setItem('token', token)
    localStorage.setItem('jait-gateway-url', api)
  }, { token, api: API_URL })
  await page.goto('/threads')
  await page.getByText('Provider sync regression', { exact: true }).first().click()
  const selector = page.getByRole('button', { name: /^Provider Codex, model/ })
  await expect(selector).toBeVisible()
  await expect(selector).toHaveAccessibleName(/gpt.?6/i)
  await expect(selector).toHaveAccessibleName(/high/i)
  await expect(selector).toBeDisabled()
  await expect(page.getByRole('button', { name: /^Provider Jait.*model/ })).toHaveCount(0)
  await expect(page.locator('[contenteditable="true"]').first()).toBeEditable()
  await page.screenshot({ path: 'test-results/thread-provider-selection.png', fullPage: true })
})
