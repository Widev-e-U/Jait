import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

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
  await page.goto('/agents')
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
