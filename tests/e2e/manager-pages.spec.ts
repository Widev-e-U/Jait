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

  await page.goto('/threads', { waitUntil: 'domcontentloaded' })
  const managerNav = page.getByRole('navigation', { name: 'Manager pages' })
  await expect(managerNav.getByRole('button', { name: 'Threads' })).toBeVisible()
  await expect(managerNav.getByRole('button', { name: 'Agents' })).toBeVisible()
  await expect(page.getByRole('tablist', { name: 'View mode' })).toBeVisible()
  await expect(page.locator('header').getByText('Pull Requests')).toHaveCount(0)

  await managerNav.getByRole('button', { name: 'Agents' }).click()
  await expect(page).toHaveURL(/\/agents$/)
  await page.getByRole('button', { name: 'New agent' }).click()
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('/api/persona-agents/') && response.request().method() === 'PUT' && response.ok() && response.request().postData()?.includes('Researcher') === true),
    page.getByRole('textbox', { name: 'Name', exact: true }).fill('Researcher'),
  ])
  await page.reload()
  await expect(page.getByRole('button', { name: /Researcher/ })).toBeVisible()

  await page.getByRole('tablist', { name: 'View mode' }).getByRole('tab', { name: 'Developer' }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('tablist', { name: 'View mode' }).getByRole('tab', { name: 'Manager' }).click()
  await expect(page).toHaveURL(/\/agents$/)
})
