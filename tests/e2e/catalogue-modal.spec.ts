import { registerTestUser } from './helpers/agent-user'
import { test, expect } from '@playwright/test'
import path from 'node:path'
const API_URL = process.env.API_URL || 'http://127.0.0.1:8100'
const shotsDir = path.resolve(__dirname, '../../.jait/shots')
let token: string
test.beforeAll(async ({ request }) => {
  const credentials = { username: 'catalogue-modal-e2e', password: 'catalogue-test-password' }
  let response = await request.post(`${API_URL}/api/auth/login`, { data: credentials })
  if (!response.ok()) response = await registerTestUser(request, API_URL, { data: credentials })
  expect(response.ok(), await response.text()).toBeTruthy()
  token = (await response.json()).access_token
})

test.beforeEach(async ({ page }) => {
  // The development-only inspector captures Escape before app dialogs receive it.
  await page.route('https://cdn.jsdelivr.net/npm/@openuidev/devtools@*/dist/devtools.browser.js*', (route) => route.abort())
})

for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile' : 'desktop'} account Catalogue opens the graph and routes to pages`, async ({ page }) => {
    test.setTimeout(90_000)
    await page.emulateMedia({ reducedMotion: mobile ? 'reduce' : 'no-preference' })
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
    await expect(modal.getByRole('heading', { name: 'Catalogue', exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(modal).not.toBeVisible()
    const launcher = page.getByRole('button', { name: 'Open catalogue', exact: true })
    await launcher.press('Enter')
    await expect(modal.getByTestId('catalogue-graph').locator('canvas')).toBeVisible({ timeout: 30_000 })
    await modal.getByRole('button', { name: 'Enter fullscreen' }).click()
    const fullscreen = await modal.boundingBox()
    const viewport = page.viewportSize()!
    expect(fullscreen?.width).toBeCloseTo(viewport.width, 0)
    expect(fullscreen?.height).toBeCloseTo(viewport.height, 0)
    const toggle = modal.getByRole('button', { name: 'Collapse catalogue details' })
    await toggle.press('Enter')
    await expect(modal.getByRole('navigation', { name: 'Browse catalogue entries' })).toBeHidden()
    const expand = modal.getByRole('button', { name: 'Expand catalogue details' })
    await expect(expand).toBeFocused()
    await expect(expand).toHaveAttribute('aria-expanded', 'false')
    await expand.press('Enter')
    await expect(modal.getByRole('navigation', { name: 'Browse catalogue entries' })).toBeVisible()
    await modal.getByRole('combobox', { name: 'Catalogue page', exact: true }).click()
    await page.getByRole('option', { name: 'Agents', exact: true }).click()
    await expect(modal.getByRole('combobox', { name: 'Catalogue page', exact: true })).toHaveText('Agents')
    await modal.getByRole('button', { name: 'agent.profiles', exact: true }).press('Enter')
    await expect(modal.getByRole('heading', { name: 'agent.profiles', exact: true })).toBeFocused()
    await expect(modal.getByRole('navigation', { name: 'Selected catalogue path' })).toContainText('Agents')
    await page.keyboard.press('Escape')
    await expect(modal.getByRole('button', { name: 'Enter fullscreen' })).toBeVisible()
    await expect(modal.getByText('Manage persistent people and teams on Jait', { exact: false })).toBeVisible()
    await page.screenshot({ path: path.join(shotsDir, `catalogue-explorer-${mobile ? 'mobile' : 'desktop'}.png`), animations: 'disabled' })
    await modal.getByLabel('Search catalogue').fill('unknown-catalogue-tool')
    await expect(modal.getByText('No matching catalogue entries.')).toBeVisible()
    await modal.getByLabel('Search catalogue').fill('thread.control')
    await modal.getByRole('button', { name: 'thread.control', exact: true }).click()
    await modal.getByRole('button', { name: 'Open Threads', exact: true }).click()
    await expect(modal).not.toBeVisible()
    await expect(page).toHaveURL(/\/threads$/)
    await launcher.click()
    await expect(modal).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(modal).not.toBeVisible()
    await expect(launcher).toBeFocused()
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
  await modal.getByText(/^Tools$/, { exact: true }).click()
  await expect(modal.getByRole('button', { name: 'agent.profiles.new', exact: true })).toBeVisible()
  await expect(modal.getByRole('button', { name: /^agent\.profiles\s*Unavailable$/ })).toContainText('Unavailable')
  await expect(modal.getByRole('alert')).toHaveCount(0)
  await modal.getByText(/^Features$/, { exact: true }).click()
  await expect(modal.getByRole('button', { name: 'Settings · Reverse Engineer Anything', exact: true })).toBeVisible()
  await modal.getByLabel('Search catalogue').fill('Reverse Engineer Anything')
  await modal.getByRole('button', { name: 'rea.inspect', exact: true }).click()
  await expect(modal.getByRole('heading', { name: 'rea.inspect', exact: true })).toBeVisible()
  await expect(modal.getByRole('button', { name: 'mcp.docs.read', exact: true })).toHaveCount(0)
  await modal.getByLabel('Search catalogue').fill('Documentation Server')
  await expect(modal.getByRole('button', { name: 'mcp.docs.read', exact: true })).toBeVisible()
})


test('installed skills appear in browse and search and open filtered Skills settings', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.addInitScript(({ token, api }) => {
    localStorage.setItem('jait-auth-token', token)
    sessionStorage.setItem('jait-auth-token', token)
    localStorage.setItem('jait-gateway-url', api)
  }, { token, api: API_URL })
  await page.route('**/api/skills', (route) => route.fulfill({ json: [{
    id: 'personal-review', name: 'Personal Review', source: 'user', enabled: false, toolsSatisfied: false,
    description: 'Review changes against a personal checklist.', filePath: '/skills/personal-review/SKILL.md',
  }] }))
  await page.goto('/agents')
  await page.getByRole('button', { name: 'Open catalogue', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Catalogue', exact: true })
  const browse = modal.getByRole('navigation', { name: 'Browse catalogue entries' })
  const personalSkill = browse.getByRole('button', { name: 'Personal Review user', exact: true })
  await expect(browse.getByText('Skills', { exact: true })).toBeVisible()
  await expect(personalSkill).toBeHidden()
  await modal.getByRole('button', { name: 'Skills', exact: true }).click()
  await expect(modal.getByRole('heading', { name: 'Installed skills', exact: true })).toBeVisible()
  await expect(personalSkill).toBeVisible()
  await page.screenshot({ path: path.join(shotsDir, 'catalogue-explorer-skills.png'), animations: 'disabled' })
  await modal.getByRole('searchbox', { name: 'Search catalogue' }).fill('personal checklist')
  await personalSkill.press('Enter')
  await expect(modal.getByRole('heading', { name: 'Personal Review' })).toBeFocused()
  const selectedPath = modal.getByRole('navigation', { name: 'Selected catalogue path' })
  await expect(selectedPath.getByRole('button')).toHaveText(['Jait', 'Settings', 'Installed skills'])
  await expect(modal.getByText(/User skill · Disabled · Missing required tools/i)).toBeVisible()
  await modal.getByRole('button', { name: 'Open Skills settings' }).click()
  await expect(modal).not.toBeVisible()
  await expect(page).toHaveURL(/\/settings\?tab=skills&skillsTab=installed&skillsQ=personal-review$/)
  await expect(page.getByText('Personal Review', { exact: true })).toBeVisible()
})
