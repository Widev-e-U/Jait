import { registerTestUser } from './helpers/agent-user'
import { test, expect } from '@playwright/test'
const API_URL = process.env.API_URL || 'http://127.0.0.1:8100'
let token: string
test.beforeAll(async ({ request }) => {
  const credentials = { username: 'catalogue-modal-e2e', password: 'catalogue-test-password' }
  let response = await request.post(`${API_URL}/api/auth/login`, { data: credentials })
  if (!response.ok()) response = await registerTestUser(request, API_URL, { data: credentials })
  expect(response.ok(), await response.text()).toBeTruthy()
  token = (await response.json()).access_token
})

for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile' : 'desktop'} account Catalogue opens the graph and routes to pages`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 })
    await page.context().addCookies([{ name: 'jait_token', value: token, url: API_URL, httpOnly: true, sameSite: 'Lax' }])
  await page.addInitScript(({ token, api }) => {
      localStorage.setItem('jait-auth-token', token)
      sessionStorage.setItem('jait-auth-token', token)
      localStorage.setItem('token', token)
      localStorage.setItem('jait-gateway-url', api)
    }, { token, api: API_URL })
    await page.goto('/agents')
    await expect(page.getByRole('button', { name: 'New agent' })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Account menu' }).click()
    const items = page.getByRole('menuitem')
    const labels = await items.allTextContents()
    expect(labels.indexOf('Catalogue')).toBe(labels.indexOf('Usage') + 1)
    await page.getByRole('menuitem', { name: 'Catalogue', exact: true }).click()
    const modal = page.getByRole('dialog', { name: 'Catalogue', exact: true })
    await expect(modal).toBeVisible()
    await expect(modal.getByTestId('catalogue-graph').locator('canvas')).toBeVisible({ timeout: 30_000 })
    await modal.getByRole('combobox', { name: 'Catalogue page', exact: true }).click()
    await page.getByRole('option', { name: 'Agents', exact: true }).click()
    await expect(modal.getByRole('combobox', { name: 'Catalogue page', exact: true })).toHaveText('Agents')
    await modal.getByRole('button', { name: 'agent.profiles', exact: true }).click()
    await expect(modal.getByRole('heading', { name: 'agent.profiles', exact: true })).toBeVisible()
    await expect(modal.getByText('Manage persistent people and teams on Jait', { exact: false })).toBeVisible()
    await page.screenshot({ path: `/tmp/jait-catalogue-${mobile ? 'mobile' : 'desktop'}.png`, animations: 'disabled' })
    await modal.getByLabel('Search catalogue').fill('unknown-catalogue-tool')
    await expect(modal.getByText('No matching pages or tools.')).toBeVisible()
    await modal.getByLabel('Search catalogue').fill('thread.control')
    await modal.getByRole('button', { name: 'thread.control', exact: true }).click()
    await modal.getByRole('button', { name: 'Open Threads', exact: true }).click()
    await expect(modal).not.toBeVisible()
    await expect(page).toHaveURL(/\/threads$/)
    await page.getByRole('button', { name: 'Account menu' }).click()
    await page.getByRole('menuitem', { name: 'Catalogue', exact: true }).click()
    await expect(modal).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(modal).not.toBeVisible()
  })
}

test('catalogue refresh includes newly registered tools and reports loading failures', async ({ page }) => {
  await page.addInitScript(({ token, api }) => {
    localStorage.setItem('jait-auth-token', token)
    sessionStorage.setItem('jait-auth-token', token)
    localStorage.setItem('jait-gateway-url', api)
    localStorage.setItem('token', token)
  }, { token, api: API_URL })
  let failed = true
  await page.route('**/api/tools', async (route) => {
    if (failed) await route.fulfill({ status: 503, json: { error: 'Unavailable' } })
    else await route.fulfill({ json: { tools: [
      { name: 'agent.profiles.new', description: 'New live tool', page: 'agents' },
      { name: 'rea.inspect', description: 'Inspect binaries', category: 'external', source: 'plugin:rea', sourceMetadata: { kind: 'plugin', pluginId: 'rea', pluginDisplayName: 'Reverse Engineer Anything' } },
      { name: 'mcp.docs.read', description: 'Read documents', category: 'external', source: 'mcp', sourceMetadata: { kind: 'mcp', serverId: 'docs', serverName: 'Documentation Server' } },
    ] } })
  })
  await page.goto('/agents')
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Catalogue', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Catalogue', exact: true })
  await expect(modal.getByRole('alert')).toContainText('Could not load catalogue')
  failed = false
  await modal.getByRole('button', { name: 'Retry', exact: true }).click()
  await expect(modal.getByRole('button', { name: 'agent.profiles.new', exact: true })).toBeVisible()
  await expect(modal.getByRole('button', { name: /^agent\.profiles\s*Unavailable$/ })).toContainText('Unavailable')
  await expect(modal.getByRole('alert')).toHaveCount(0)
  await expect(modal.getByRole('button', { name: 'Settings · Reverse Engineer Anything', exact: true })).toBeVisible()
  await modal.getByLabel('Search catalogue').fill('Reverse Engineer Anything')
  await modal.getByRole('button', { name: 'rea.inspect', exact: true }).click()
  await expect(modal.getByRole('heading', { name: 'rea.inspect', exact: true })).toBeVisible()
  await expect(modal.getByRole('button', { name: 'mcp.docs.read', exact: true })).toHaveCount(0)
  await modal.getByLabel('Search catalogue').fill('Documentation Server')
  await expect(modal.getByRole('button', { name: 'mcp.docs.read', exact: true })).toBeVisible()
})
