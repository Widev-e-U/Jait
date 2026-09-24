import { test, expect } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://127.0.0.1:8100'

test('manager pages have separate routes and keep server saved agents', async ({ page, request }) => {
  const registration = await request.post(`${API_URL}/api/auth/register`, {
    data: { username: `manager-pages-${Date.now()}`, password: 'manager-pages-test-password' },
  })
  expect(registration.ok()).toBeTruthy()
  const { access_token: token } = await registration.json()
  await page.addInitScript(({ token, api }) => {
    localStorage.setItem('jait-auth-token', token)
    sessionStorage.setItem('jait-auth-token', token)
    localStorage.setItem('token', token)
    localStorage.setItem('jait-gateway-url', api)
  }, { token, api: API_URL })

  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto('/agents', { waitUntil: 'domcontentloaded', timeout: 60_000 })
    try {
      await expect(page.getByRole('button', { name: 'New agent' })).toBeVisible({ timeout: 20_000 })
      break
    } catch (error) {
      if (attempt === 1) throw error
    }
  }
  await expect(page.getByRole('button', { name: 'Threads', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Agents', exact: true })).toBeVisible()
  await expect(page.getByRole('tablist', { name: 'View mode' })).toBeVisible()
  await expect(page.locator('header').getByText('Pull Requests')).toHaveCount(0)

  await page.getByRole('button', { name: 'Threads', exact: true }).click()
  await expect(page).toHaveURL(/\/threads$/)
  await page.getByRole('button', { name: 'Agents', exact: true }).click()
  await expect(page).toHaveURL(/\/agents$/)
  await page.getByRole('button', { name: 'New agent' }).click()
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Researcher')
  await page.getByRole('textbox', { name: 'Role and responsibilities' }).fill('Research web topics and write reports')
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/persona-agents/') && response.request().method() === 'PUT' && response.ok() && response.request().postData()?.includes('Researcher') === true),
    page.getByRole('button', { name: 'Create agent', exact: true }).click(),
  ])
  await expect(page.getByRole('heading', { name: 'Ask Researcher' })).toBeVisible()
  const sections = page.getByRole('complementary', { name: 'Agent sections' })
  await expect(sections.getByRole('button', { name: 'Skills' })).toBeVisible()
  await sections.getByRole('button', { name: 'Tasks & runs' }).click()
  await page.getByRole('textbox', { name: 'Task name' }).fill('Weekly brief')
  await page.getByRole('textbox', { name: 'Task instructions' }).fill('Summarize the most important updates')
  await page.getByRole('textbox', { name: 'Task cron schedule' }).fill('0 9 * * 1')
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/jobs') && response.request().method() === 'POST' && response.ok()),
    page.getByRole('button', { name: 'Add task' }).click(),
  ])
  await expect(page.getByText('Weekly brief', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('button', { name: /Researcher/ })).toBeVisible()
  await page.getByRole('button', { name: /Researcher/ }).click()
  await expect(page.getByRole('heading', { name: 'Ask Researcher' })).toBeVisible()
  await sections.getByRole('button', { name: 'Tasks & runs' }).click()
  await expect(page.getByText('Weekly brief', { exact: true })).toBeVisible()

  await page.getByRole('tablist', { name: 'View mode' }).getByRole('tab', { name: 'Developer' }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('tablist', { name: 'View mode' }).getByRole('tab', { name: 'Manager' }).click()
  await expect(page).toHaveURL(/\/agents$/)
})
