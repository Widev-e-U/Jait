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
    await expect(page.getByRole('button', { name: 'Open catalogue', exact: true })).toHaveCount(0)
    const accountMenu = page.getByRole('button', { name: 'Account menu' })
    const catalogueItem = page.getByRole('menuitem', { name: 'Catalogue', exact: true })
    await accountMenu.click()
    const items = page.getByRole('menuitem')
    const labels = await items.allTextContents()
    expect(labels.indexOf('Catalogue')).toBe(labels.indexOf('Usage') + 1)
    await catalogueItem.click()
    const modal = page.getByRole('dialog', { name: 'Catalogue', exact: true })
    await expect(modal).toBeVisible()
    await expect(modal.getByRole('heading', { name: 'Catalogue', exact: true })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(modal).not.toBeVisible()
    await expect(accountMenu).toBeFocused()
    await accountMenu.press('Enter')
    await catalogueItem.press('Enter')
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
    await modal.getByRole('button', { name: 'Reset', exact: true }).click()
    await expect(modal.getByLabel('Search catalogue')).toHaveValue('')
    await expect(modal.getByRole('combobox', { name: 'Catalogue page' })).toHaveText('All pages')
    await modal.getByLabel('Search catalogue').fill('thread.control')
    await modal.getByRole('button', { name: 'thread.control', exact: true }).click()
    await modal.getByRole('button', { name: 'Open Threads', exact: true }).click()
    await expect(modal).not.toBeVisible()
    await expect(page).toHaveURL(/\/threads$/)
    await accountMenu.click()
    await catalogueItem.click()
    await expect(modal).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(modal).not.toBeVisible()
    await expect(accountMenu).toBeFocused()
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
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Catalogue', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Catalogue', exact: true })
  const browse = modal.getByRole('navigation', { name: 'Browse catalogue entries' })
  const personalSkill = browse.getByRole('button', { name: 'Personal Review user', exact: true })
  await expect(browse.getByText('Skills', { exact: true })).toBeVisible()
  await expect(personalSkill).toBeHidden()
  await expect(modal.getByRole('button', { name: 'Skills', exact: true })).toHaveCount(0)
  await modal.getByRole('combobox', { name: 'Catalogue page' }).click()
  await page.getByRole('option', { name: 'Settings', exact: true }).click()
  await browse.locator('summary').filter({ hasText: 'Features' }).click()
  await browse.getByRole('button', { name: 'Settings · Installed skills', exact: true }).click()
  await expect(modal.getByRole('heading', { name: 'Installed skills', exact: true })).toBeVisible()
  await expect(personalSkill).toBeVisible()
  await expect(browse.getByRole('button', { name: 'Settings · discovery', exact: true, includeHidden: true })).toHaveCount(0)
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


test('catalogue nodes drag without selecting and branch clicks filter both panes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(({ token, api }) => {
    localStorage.setItem('jait-auth-token', token)
    sessionStorage.setItem('jait-auth-token', token)
    localStorage.setItem('jait-gateway-url', api)
  }, { token, api: API_URL })
  await page.route('**/api/tools', (route) => route.fulfill({ json: { tools: Array.from({ length: 40 }, (_, index) => ({
    name: `example.tool-${String(index).padStart(2, '0')}`,
    description: 'Example catalogue tool',
    page: 'agents',
  })) } }))
  await page.goto('/agents')
  await page.getByRole('button', { name: 'Account menu' }).click()
  await page.getByRole('menuitem', { name: 'Catalogue', exact: true }).click()
  const modal = page.getByRole('dialog', { name: 'Catalogue', exact: true })
  await modal.getByRole('searchbox', { name: 'Search catalogue' }).fill('example.tool-')
  const entry = modal.getByRole('button', { name: 'example.tool-25', exact: true })
  await expect(entry).toBeVisible()
  await entry.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  const before = await entry.boundingBox()
  await entry.click()
  await expect(modal.getByRole('heading', { name: 'example.tool-25', exact: true })).toBeAttached()
  await expect(entry).toBeInViewport()
  await expect.poll(async () => Math.abs((await entry.boundingBox())!.y - before!.y)).toBeLessThan(2)

  await modal.getByRole('searchbox', { name: 'Search catalogue' }).clear()
  const pageFilter = modal.getByRole('combobox', { name: 'Catalogue page' })
  await pageFilter.click()
  await page.getByRole('option', { name: 'Chat', exact: true }).click()
  await expect(modal.getByRole('heading', { name: 'Chat', exact: true })).toBeVisible()
  const canvas = modal.getByTestId('catalogue-graph').locator('canvas').first()
  const readCamera = () => canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext('2d')!
    const camera = context.getTransform()
    return { x: camera.e, y: camera.f, scale: camera.a }
  })
  const rootNodePosition = () => canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext('2d')!
    const { width, height, clientWidth, clientHeight } = element
    const { data } = context.getImageData(0, 0, width, height)
    let count = 0
    let x = 0
    let y = 0
    for (let offset = 0; offset < data.length; offset += 4) {
      // Pink pixels are the Jait root node.
      if (data[offset] !== 244 || data[offset + 1] !== 114 || data[offset + 2] !== 182 || data[offset + 3] !== 255) continue
      const pixel = offset / 4
      x += pixel % width
      y += Math.floor(pixel / width)
      count++
    }
    return count ? { x: (x / count) * clientWidth / width, y: (y / count) * clientHeight / height } : null
  })
  await expect.poll(rootNodePosition).not.toBeNull()
  const root = (await rootNodePosition())!
  const initialCamera = await readCamera()
  await canvas.hover({ position: root })
  await page.mouse.wheel(0, -150)
  await expect.poll(async () => (await readCamera()).scale).toBeGreaterThan(initialCamera.scale)
  const position = (await rootNodePosition())!
  await canvas.hover({ position })
  await expect(canvas).toHaveClass(/clickable/)
  const zoomedCamera = await readCamera()
  const canvasBounds = (await canvas.boundingBox())!
  await page.mouse.down()
  await page.mouse.move(canvasBounds.x + position.x + 45, canvasBounds.y + position.y + 25, { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => {
    const moved = await rootNodePosition()
    return moved ? Math.hypot(moved.x - position.x, moved.y - position.y) : 0
  }).toBeGreaterThan(30)
  expect(await readCamera()).toEqual(zoomedCamera)
  await expect(modal.getByRole('heading', { name: 'Chat', exact: true })).toBeVisible()

  const movedPosition = (await rootNodePosition())!
  await canvas.hover({ position: movedPosition })
  await expect(canvas).toHaveClass(/clickable/)
  await canvas.click({ position: movedPosition })
  await expect(modal.getByRole('heading', { name: 'Jait', exact: true })).toBeVisible()
  await expect(pageFilter).toHaveText('All pages')

  const entries = modal.getByRole('navigation', { name: 'Browse catalogue entries' })
  await entries.locator('summary').filter({ hasText: 'Pages' }).click()
  await entries.getByRole('button', { name: 'Agents', exact: true }).click()
  await expect(modal.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible()
  await expect(pageFilter).toHaveText('Agents')
  await expect(entries.getByRole('button', { name: 'Chat', exact: true, includeHidden: true })).toHaveCount(0)
  await expect(entry).toBeVisible()
  await entries.locator('summary').filter({ hasText: 'Features' }).click()
  await entries.getByRole('button', { name: 'Agents · profiles', exact: true }).click()
  await expect(modal.getByRole('heading', { name: 'profiles', exact: true })).toBeVisible()
  await expect(entries.getByRole('button', { name: 'Agents · team chat', exact: true, includeHidden: true })).toHaveCount(0)
  await expect(entry).toHaveCount(0)
  const profilesTool = entries.getByRole('button', { name: 'agent.profiles Unavailable', exact: true })
  const inspectTool = entries.getByRole('button', { name: 'agent.profiles.inspect Unavailable', exact: true })
  await profilesTool.click()
  await expect(modal.getByRole('heading', { name: 'agent.profiles', exact: true })).toBeVisible()
  await expect(inspectTool).toBeVisible()
  await expect(modal.getByRole('navigation', { name: 'Selected catalogue path' })).toContainText('profiles')
  await modal.screenshot({ path: path.join(shotsDir, 'catalogue-explorer-branch.png'), animations: 'disabled' })
  await modal.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(pageFilter).toHaveText('All pages')
  await expect(modal.getByRole('heading', { name: 'Jait', exact: true })).toBeVisible()
  await expect(entries.getByRole('button', { name: 'Chat', exact: true, includeHidden: true })).toHaveCount(1)
})
