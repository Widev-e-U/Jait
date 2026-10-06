import { test, expect } from '@playwright/test'

test('catalog and persistent agent cards navigate to the correct Jait pages', async ({ page }) => {
  await page.goto('/capability-catalog.html')
  await expect(page.getByTestId('profile').getByRole('link', { name: 'Open Agents' })).toBeVisible()
  await page.getByTestId('profile').getByRole('link', { name: 'Open Agents' }).click()
  await expect(page.getByTestId('destination')).toHaveText('/agents')
  await page.getByTestId('job').getByRole('link', { name: 'Open Jobs' }).click()
  await expect(page.getByTestId('destination')).toHaveText('/jobs')
  const catalog = page.getByTestId('catalog')
  await catalog.getByRole('button').first().click()
  await expect(catalog.getByTestId('jait-catalog-result')).toBeVisible()
  await expect(catalog.getByText('Manage persistent Jait people and teams', { exact: false })).toBeVisible()
  const external = page.getByTestId('external-catalog')
  await external.getByRole('button').first().click()
  await expect(external.getByTestId('jait-catalog-result')).toBeVisible()
  await external.getByRole('link', { name: 'Open Agents' }).click()
  await expect(page.getByTestId('destination')).toHaveText('/agents')
})

test('live gateway exposes the catalog and page navigation preserves destination views', async ({ page, request }) => {
  test.setTimeout(90_000)
  const api = process.env.API_URL || 'http://127.0.0.1:8100'
  const registration = await request.post(`${api}/api/auth/register`, {
    data: { username: `catalog-${Date.now()}`, password: 'catalog-test-password' },
  })
  expect(registration.ok()).toBeTruthy()
  const { access_token: token } = await registration.json()
  const headers = { Authorization: `Bearer ${token}` }
  const projectResponse = await request.post(`${api}/api/projects`, { headers, data: { title: 'Catalog checks', kind: 'folder' } })
  const project = await projectResponse.json()
  const sessionResponse = await request.post(`${api}/api/projects/${project.id}/sessions`, { headers, data: { name: 'Catalog' } })
  const session = await sessionResponse.json()
  const catalogResponse = await request.post(`${api}/mcp`, {
    headers: { ...headers, 'x-jait-session-id': session.id },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'jait_catalog', arguments: {} } },
  })
  expect(catalogResponse.ok()).toBeTruthy()
  const result = (await catalogResponse.json()).result
  expect(result.isError).toBe(false)
  const text = result.content[0].text
  const data = JSON.parse(text.slice(text.indexOf('{')))
  expect(data.pages.map((entry: { id: string }) => entry.id)).toContain('agents')
  expect(data.pages.find((entry: { id: string }) => entry.id === 'agents').features[0].availableToolRefs).toContain('agent.profiles')
  const inspectResponse = await request.post(`${api}/mcp`, {
    headers: { ...headers, 'x-jait-session-id': session.id },
    data: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'agent_profiles_inspect', arguments: { action: 'list' } } },
  })
  expect((await inspectResponse.json()).result.isError).toBe(false)
  await page.addInitScript(({ token, api }) => {
    localStorage.setItem('jait-auth-token', token)
    sessionStorage.setItem('jait-auth-token', token)
    localStorage.setItem('token', token)
    localStorage.setItem('jait-gateway-url', api)
  }, { token, api })
  await page.goto('/agents')
  await expect(page.getByRole('button', { name: 'New agent' })).toBeVisible({ timeout: 30_000 })
  for (const destination of ['/jobs', '/threads', '/agents']) {
    await page.evaluate(async (link) => {
      const modulePath = '/src/lib/notification-navigation.ts'
      const { openNotification } = await import(modulePath)
      openNotification({ id: `catalog:${link}`, link })
    }, destination)
    await expect(page).toHaveURL(new RegExp(destination + '$'))
  }
  await expect(page.getByRole('button', { name: 'New agent' })).toBeVisible()
})
