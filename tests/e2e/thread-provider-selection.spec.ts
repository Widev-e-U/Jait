import { test, expect } from '@playwright/test'
import path from 'node:path'
import { registerAgentTestUser } from './helpers/agent-user'

const API_URL = process.env.API_URL || 'http://127.0.0.1:8100'

test('opening a running thread shows its actual provider and model', async ({ page, request, isMobile }) => {
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
  const transcript = page.locator('[data-conversation-scroll]').locator('..')
  await expect(transcript).toHaveCSS('border-bottom-width', '0px')
  await expect(transcript.locator('..')).toHaveCSS('border-bottom-width', '0px')
  const minimap = page.getByRole('slider', { name: 'Conversation minimap' })
  if (isMobile) await expect(minimap).toHaveCount(0)
  else await expect(minimap).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry devices' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Agent controls', exact: true })).toBeVisible()
  await expect(page.getByText('Autonomous work is halted.', { exact: true })).toHaveCount(0)
  if (isMobile) {
    const header = page.locator('header').first()
    const stop = page.getByRole('button', { name: 'Stop thread', exact: true }).first()
    const headerBox = await header.boundingBox()
    const stopBox = await stop.boundingBox()
    const toolbarTop = await stop.evaluate(element => element.closest('.border-b')!.getBoundingClientRect().top)
    expect(headerBox).not.toBeNull()
    expect(stopBox).not.toBeNull()
    expect(toolbarTop, 'The whole thread toolbar must sit below the floating header').toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height + 8)
    expect(stopBox!.y, 'Thread controls must clear the floating mobile header').toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height + 8)
  }
  await page.screenshot({ path: path.resolve(__dirname, `../../.jait/shots/thread-provider-selection${isMobile ? '-mobile' : ''}.png`), fullPage: true })
  await page.goto('/agents')
  const stopAll = page.getByRole('button', { name: 'Agent controls', exact: true })
  await expect(stopAll).toBeVisible()
  if (isMobile) {
    const headerBox = await page.locator('header').first().boundingBox()
    const stopAllBox = await stopAll.boundingBox()
    expect(headerBox).not.toBeNull()
    expect(stopAllBox).not.toBeNull()
    expect(stopAllBox!.y).toBeGreaterThanOrEqual(headerBox!.y)
    expect(stopAllBox!.y + stopAllBox!.height).toBeLessThanOrEqual(headerBox!.y + headerBox!.height)
    expect(stopAllBox!.width).toBeLessThanOrEqual(64)
  }
})
