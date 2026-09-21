import { test, expect } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://127.0.0.1:8100'

test('notification navigation switches chats and preserves the previous draft', async ({ page, request }) => {
  test.setTimeout(90_000)
  const registration = await request.post(`${API_URL}/api/auth/register`, {
    data: { username: `notification-${Date.now()}`, password: 'notification-test-password' },
  })
  expect(registration.ok()).toBeTruthy()
  const { access_token: token } = await registration.json()
  const headers = { Authorization: `Bearer ${token}` }
  const projectResponse = await request.post(`${API_URL}/api/projects`, { headers, data: { title: 'Notification routing', kind: 'folder' } })
  expect(projectResponse.ok()).toBeTruthy()
  const project = await projectResponse.json()
  const sessions = []
  for (const name of ['Draft chat', 'Completed chat']) {
    const response = await request.post(`${API_URL}/api/projects/${project.id}/sessions`, { headers, data: { name } })
    expect(response.ok()).toBeTruthy()
    sessions.push(await response.json())
  }
  await page.addInitScript(({ token, api }) => {
    localStorage.setItem('jait-auth-token', token)
    sessionStorage.setItem('jait-auth-token', token)
    localStorage.setItem('token', token)
    localStorage.setItem('jait-gateway-url', api)
    localStorage.setItem('jait.viewMode', 'developer')
  }, { token, api: API_URL })
  await page.goto(`/chat?sessionId=${sessions[0].id}&projectId=${project.id}`, { waitUntil: 'domcontentloaded' })
  const input = page.locator('[contenteditable="true"]').first()
  await expect(input).toBeVisible({ timeout: 30_000 })
  await input.fill('Keep this unsent notification draft')
  const open = async (id: string) => {
    await page.evaluate(async ({ id, projectId }) => {
      // Exercise the same shared entry used by native taps and browser notification clicks.
      const modulePath = '/src/lib/notification-navigation.ts'
      const { openNotification } = await import(modulePath)
      openNotification({ id: `chat-complete:${id}`, link: `/chat?sessionId=${id}&projectId=${projectId}` })
    }, { id, projectId: project.id })
    await expect.poll(async () => {
      const result = await request.get(`${API_URL}/api/projects/last-active`, { headers })
      return (await result.json()).session?.id
    }).toBe(id)
  }
  await open(sessions[1].id)
  await expect(input).toHaveText('')
  await open(sessions[0].id)
  await expect(input).toHaveText('Keep this unsent notification draft')
})
