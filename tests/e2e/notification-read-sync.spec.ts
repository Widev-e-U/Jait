import { test, expect, type WebSocketRoute } from '@playwright/test'
import { registerTestUser } from './helpers/agent-user'

test.use({ screenshot: 'off' })
const API_URL = process.env.API_URL || 'http://127.0.0.1:8100'

test('opening the notified chat acknowledges its exact completion over the live UI socket', async ({ page, request }) => {
  test.setTimeout(90_000)
  const registration = await registerTestUser(request, API_URL, {
    data: { username: `notification-read-${Date.now()}`, password: 'notification-read-test-password' },
  })
  expect(registration.ok()).toBeTruthy()
  const { access_token: token } = await registration.json()
  const headers = { Authorization: `Bearer ${token}` }
  const projectResponse = await request.post(`${API_URL}/api/projects`, { headers, data: { title: 'Notification read sync', kind: 'folder' } })
  expect(projectResponse.ok()).toBeTruthy()
  const project = await projectResponse.json()
  const sessions = []
  for (const name of ['Current chat', 'Notified chat']) {
    const response = await request.post(`${API_URL}/api/projects/${project.id}/sessions`, { headers, data: { name } })
    expect(response.ok()).toBeTruthy()
    sessions.push(await response.json())
  }
  await page.context().addCookies([{ name: 'jait_token', value: token, url: API_URL, httpOnly: true, sameSite: 'Lax' }])
  await page.addInitScript(({ token, api }) => {
    localStorage.setItem('jait-auth-token', token)
    sessionStorage.setItem('jait-auth-token', token)
    localStorage.setItem('jait-gateway-url', api)
    localStorage.setItem('jait.viewMode', 'developer')
  }, { token, api: API_URL })

  // Use the real hook, focus handling, navigation and native bridge; isolate transport delivery.
  const sent: Array<{ type: string; sessionId?: string; payload?: { id?: string; resource?: string } }> = []
  let socket: WebSocketRoute | undefined
  await page.routeWebSocket(/ws:\/\/.*\?token=.*surface=/, route => {
    socket = route
    route.onMessage(raw => {
      const message = JSON.parse(String(raw))
      sent.push(message)
      if (message.type === 'resource.subscribe' && message.payload.resource === 'root:/chat-notifications') {
        route.send(JSON.stringify({ type: 'notification.snapshot', payload: { notifications: [] } }))
      }
    })
  })
  await page.goto(`/chat?sessionId=${sessions[0].id}&projectId=${project.id}`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[contenteditable="true"]').first()).toBeVisible({ timeout: 30_000 })
  await expect.poll(() => Boolean(socket)).toBe(true)
  await page.bringToFront()
  await page.evaluate(() => {
    const state = window as unknown as { Capacitor: unknown; notificationCancels: unknown[]; notificationPosts: unknown[] }
    state.notificationCancels = []
    state.notificationPosts = []
    state.Capacitor = { Plugins: { AgentOverlay: {
      notify: async (value: unknown) => { state.notificationPosts.push(value) },
      cancelNotification: async (value: unknown) => { state.notificationCancels.push(value) },
    } } }
    window.dispatchEvent(new Event('focus'))
  })
  const state = { id: 'e2e-completion', sessionId: sessions[1].id, replaceId: `chat-complete:${sessions[1].id}`, read: false }
  socket!.send(JSON.stringify({ type: 'notification', sessionId: state.sessionId, payload: {
    ...state, kind: 'completion', title: 'Ready', body: 'Result available', includeToast: false,
  } }))
  await expect.poll(() => page.evaluate(() => (window as unknown as { notificationPosts: unknown[] }).notificationPosts.length)).toBe(1)
  expect(sent.filter(message => message.type === 'notification.read')).toEqual([])
  await page.evaluate(async ({ state, projectId }) => {
    const modulePath = '/src/lib/notification-navigation.ts'
    const { openNotification } = await import(modulePath)
    openNotification({ id: state.replaceId, link: `/chat?sessionId=${state.sessionId}&projectId=${projectId}` })
  }, { state, projectId: project.id })
  await expect.poll(() => sent.filter(message => message.type === 'notification.read').map(message => ({
    sessionId: message.sessionId, id: message.payload?.id,
  }))).toContainEqual({ sessionId: state.sessionId, id: state.id })
  socket!.send(JSON.stringify({ type: 'notification.cleared', sessionId: state.sessionId, payload: { ...state, read: true } }))
  await expect.poll(() => page.evaluate(() => (window as unknown as { notificationCancels: unknown[] }).notificationCancels))
    .toContainEqual({ id: state.replaceId, eventId: state.id })
})
