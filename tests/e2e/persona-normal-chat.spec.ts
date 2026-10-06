import { expect, test } from '@playwright/test'

import { registerAgentTestUser } from './helpers/agent-user'

const API_URL = process.env.API_URL || 'http://127.0.0.1:8100'

// Owned profiles and sessions use the real gateway. The provider event wire is
// controlled so this regression never requires paid model access.
test('normal chat addresses a saved agent, streams its identity, cancels and restores attribution', async ({ page, request }, testInfo) => {
  test.setTimeout(90_000)
  const token = await registerAgentTestUser(request, API_URL, `persona-chat-${Date.now()}-${Math.random().toString(36).slice(2)}`, 'persona-chat-test-password')
  const headers = { Authorization: `Bearer ${token}` }
  const id = `speaker-${Date.now()}`
  const profile = {
    id, name: 'Captain Standup', persona: 'Respond as a concise coordinator', avatar: 'Nova', providerId: 'jait', model: 'saved-model',
    repositoryIds: [], skillIds: [], usesAllSkills: false, allowedTools: [], requiresApproval: true, paused: false,
    schedule: { kind: 'adaptive', rules: '' }, notificationChannels: [], notificationEvents: [],
  }
  expect((await request.put(`${API_URL}/api/persona-agents/${id}`, { headers, data: profile })).ok()).toBeTruthy()
  const created = await request.post(`${API_URL}/api/sessions`, { headers, data: { name: 'Saved agent conversation' } })
  expect(created.ok()).toBeTruthy()
  const session = await created.json() as { id: string }
  const persona = { id, name: profile.name, avatar: profile.avatar, providerId: profile.providerId, model: profile.model }
  let posted: Record<string, unknown> | undefined
  let cancelled = false
  let emitted = false
  let start!: () => void
  let stop!: () => void
  const started = new Promise<void>(resolve => { start = resolve })
  const stopped = new Promise<void>(resolve => { stop = resolve })
  const body = (events: Record<string, unknown>[]) => events.map((event, index) => `id: ${index + 1}\ndata: ${JSON.stringify(event)}\n\n`).join('')
  await page.route(`**/api/sessions/${session.id}/messages*`, route => route.fulfill({ json: {
    messages: posted ? [
      { id: 'user-fixture', role: 'user', content: 'Status please' },
      { id: 'assistant-fixture', role: 'assistant', content: 'Captain is responding', persona },
    ] : [], streaming: Boolean(posted && !cancelled), total: posted ? 2 : 0, hasMore: false, seq: emitted ? 2 : 0,
  } }))
  await page.route(`**/api/sessions/${session.id}/events*`, async route => {
    await started
    if (!emitted) {
      emitted = true
      await route.fulfill({ contentType: 'text/event-stream', body: body([
        { type: 'request', content: 'Status please', persona, personaAgentId: id },
        { type: 'token', content: 'Captain is responding' },
      ]) })
    } else {
      await stopped
      await route.fulfill({ contentType: 'text/event-stream', body: body([{ type: 'done', session_id: session.id }]) })
    }
  })
  await page.route('**/api/chat', async route => {
    posted = route.request().postDataJSON()
    await route.fulfill({ status: 200, json: { accepted: true, sessionId: session.id } })
    start()
  })
  await page.route(`**/api/sessions/${session.id}/cancel`, async route => {
    cancelled = true
    await route.fulfill({ json: { ok: true, cancelled: true } })
    stop()
  })
  await page.addInitScript(({ token, api }) => {
    localStorage.setItem('jait-auth-token', token)
    sessionStorage.setItem('jait-auth-token', token)
    localStorage.setItem('token', token)
    localStorage.setItem('jait-gateway-url', api)
  }, { token, api: API_URL })
  await page.addLocatorHandler(page.getByText('A node needs your permission', { exact: true }), async () => {
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click()
  })
  await page.goto(`/?sessionId=${session.id}`, { waitUntil: 'domcontentloaded' })
  const recipient = page.getByLabel('Chat recipient')
  await expect(recipient).toBeVisible()
  await expect(recipient.locator(`option[value="${id}"]`)).toHaveText('Captain Standup')
  await recipient.selectOption(id)
  await page.locator('[data-testid="chat-composer"] [contenteditable="true"]').fill('Status please')
  await page.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect.poll(() => posted?.personaAgentId).toBe(id)
  expect(posted?.sessionId).toBe(session.id)
  const speaker = page.locator(`[data-persona-agent-id="${id}"]`)
  await expect(speaker).toContainText('Captain Standup')
  await expect(speaker).toContainText('saved-model')
  await expect(speaker.locator('svg.agent-creature')).toBeVisible()
  await expect(page.getByText('Captain is responding', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Stop generating', exact: true }).click()
  await expect.poll(() => cancelled).toBe(true)
  // Current profile edits cannot rename a past response.
  expect((await request.put(`${API_URL}/api/persona-agents/${id}`, { headers, data: { ...profile, name: 'Renamed captain', model: 'new-model' } })).ok()).toBeTruthy()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(speaker).toContainText('Captain Standup')
  await expect(speaker).toContainText('saved-model')
  await expect(page.getByText('Captain is responding', { exact: true })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('saved-agent-normal-chat.png'), fullPage: true })
})
