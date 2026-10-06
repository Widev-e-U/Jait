import { test, expect } from '@playwright/test'

test('team room shows neutral chat relays, agent identity, work links and addressed replies', async ({ page }) => {
  const members = [
    { id: 'scrum', name: 'Scrum', role: 'Coordinator', avatar: 'Nova', paused: false },
    { id: 'developer', name: 'Developer', role: 'Developer', avatar: 'Atlas', paused: false },
  ]
  const room = { id: 'fixture-room', rootAgentId: 'scrum', name: 'Scrum · Team', goal: null }
  const messages = [
    { id: 'relay', roomId: room.id, sender: { kind: 'chat', id: 'source', name: 'Developer Chat', avatar: null, sourceSessionId: 'source' }, content: 'Jakob said: Please implement ticket notifications.', kind: 'relay', recipientIds: ['developer'], createdAt: '2026-10-06T12:00:00Z', depth: 0 },
    { id: 'result', roomId: room.id, sender: { kind: 'agent', id: 'developer', name: 'Developer', avatar: 'Atlas' }, content: 'Implementation ready for QA.', kind: 'result', recipientIds: [], createdAt: '2026-10-06T12:01:00Z', depth: 1, workSessionId: 'work-one' },
  ]
  const deliveries = [{ id: 'delivery', roomId: room.id, messageId: 'relay', agentId: 'developer', sessionId: 'work-one', status: 'completed', error: null }]
  let posted: Record<string, unknown> | undefined
  await page.route('**/api/team-rooms/fixture-room', route => route.fulfill({ json: { room, members, messages, deliveries } }))
  await page.route('**/api/team-rooms/fixture-room/messages', async route => {
    posted = route.request().postDataJSON()
    messages.push({ id: 'user', roomId: room.id, sender: { kind: 'user', id: 'jakob', name: 'Jakob', avatar: null }, content: String(posted!.content), kind: 'discussion', recipientIds: posted!.recipientIds as string[], createdAt: '2026-10-06T12:02:00Z', depth: 0 })
    await route.fulfill({ status: 201, json: { message: messages.at(-1) } })
  })
  await page.goto('/team-chat.html')
  await expect(page.getByRole('heading', { name: 'Scrum · Team' })).toBeVisible()
  const relay = page.getByTestId('team-message').filter({ hasText: 'Developer Chat' })
  await expect(relay.getByRole('img', { name: 'Neutral chat persona' })).toHaveClass(/bg-gray-400/)
  await expect(relay).toContainText('Jakob said:')
  await expect(relay.getByRole('link', { name: 'Source chat' })).toHaveAttribute('href', '/?sessionId=source')
  await expect(page.getByRole('link', { name: 'Work conversation', exact: true })).toHaveAttribute('href', '/?sessionId=work-one')
  await page.getByLabel('Message recipient').selectOption('developer')
  await page.getByLabel('Work conversation', { exact: true }).selectOption('work-one')
  await page.getByLabel('Message the team').fill('Retest the acceptance criteria')
  await page.getByRole('button', { name: 'Send team message' }).click()
  await expect(page.getByTestId('team-message').filter({ hasText: 'Retest the acceptance criteria' })).toContainText('Jakob')
  expect(posted).toMatchObject({ recipientIds: ['developer'], targetSessionId: 'work-one' })
  expect(posted!.clientKey).toBeTruthy()
  await page.screenshot({ path: 'test-results/team-chat.png', fullPage: true })
})

test('team room preserves direct user messages and work links through reload', async ({ page, request }) => {
  test.setTimeout(90_000)
  const api = process.env.API_URL || 'http://127.0.0.1:8100'
  const registration = await request.post(api + '/api/auth/register', { data: { username: 'team-' + Date.now(), password: 'team-test-password' } })
  expect(registration.ok()).toBeTruthy()
  const { access_token: token } = await registration.json()
  const headers = { Authorization: 'Bearer ' + token }
  for (const [id, name, parent] of [['lead', 'Coordinator', null], ['worker', 'Developer', 'lead']] as const) {
    const saved = await request.put(api + '/api/persona-agents/' + id, { headers, data: {
      id, name, reportsToId: parent, persona: 'Test team member', avatar: 'Nova', providerId: 'jait',
      repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: true,
      schedule: { kind: 'adaptive', rules: '' }, notificationChannels: [], notificationEvents: [],
    } })
    expect(saved.ok()).toBeTruthy()
  }
  await page.addInitScript(({ token, api }) => {
    localStorage.setItem('jait-auth-token', token)
    sessionStorage.setItem('jait-auth-token', token)
    localStorage.setItem('token', token)
    localStorage.setItem('jait-gateway-url', api)
  }, { token, api })
  const created = await request.post(api + '/api/team-rooms', { headers, data: { agentId: 'lead' } })
  expect(created.ok()).toBeTruthy()
  const { room } = await created.json()
  await page.goto('/team-chat.html?roomId=' + room.id)
  await expect(page.getByRole('heading', { name: 'Coordinator · Team' })).toBeVisible()
  await page.getByLabel('Message the team').fill('Please verify the ticket')
  await page.getByRole('button', { name: 'Send team message' }).click()
  await expect(page.getByTestId('team-message').filter({ hasText: 'Please verify the ticket' })).toBeVisible()
  await expect(page.getByText('Agent is paused.', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Coordinator · Work conversation' })).toHaveAttribute('href', /sessionId=/)
  await page.reload()
  await expect(page.getByTestId('team-message').filter({ hasText: 'Please verify the ticket' })).toBeVisible()
})
