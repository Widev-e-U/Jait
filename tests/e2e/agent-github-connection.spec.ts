import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'

const connection = { userId: 'u', agentId: 'fixture agent', appId: '123', appSlug: 'fixture', appName: 'Fixture App', status: 'awaiting_installation', hasPrivateKey: true, installationId: null }
const endpoint = '**/api/agents/fixture%20agent/github-app'
const state = 'fixture-signed-state'
const installUrl = `https://github.com/apps/fixture/installations/new?state=${state}`
async function mount(page: Page, native = true, connected = false) {
  await page.route(endpoint, route => route.fulfill({
    headers: native ? { 'x-jait-github-installation-flow': 'stateful', 'access-control-expose-headers': 'x-jait-github-installation-flow' } : {},
    json: { connection: { ...connection, ...(connected ? { status: 'connected', installationId: '99' } : {}) }, webhookSecretAvailable: true },
  }))
  await page.goto('/src/e2e-fixtures/index.html')
  await page.evaluate(() => import('/src/e2e-fixtures/agent-github-connection.tsx'))
  await expect(page.getByText('Checking connection…')).toHaveCount(0)
  await expect(page.getByText('Fixture App', { exact: false }).first()).toBeVisible()
}

test('native install requests state only on click and navigates to the returned URL', async ({ page }) => {
  let calls = 0
  let release: (() => void) | undefined
  await page.route(`${endpoint}/installation-url`, async route => {
    calls++
    expect(route.request().method()).toBe('POST')
    expect(route.request().headers().authorization).toBe('Bearer github-browser-fixture')
    expect(route.request().postData()).toBeNull()
    await new Promise<void>(resolve => { release = resolve })
    await route.fulfill({ json: { state, installUrl } })
  })
  // No external GitHub traffic: navigation terminates in a local browser fixture.
  await page.route('https://github.com/**', route => route.fulfill({ contentType: 'text/html', body: '<h1>GitHub installation fixture</h1>' }))
  await mount(page)
  expect(calls).toBe(0)
  await page.reload()
  await page.evaluate(() => import('/src/e2e-fixtures/agent-github-connection.tsx'))
  await expect(page.getByRole('button', { name: 'Install on GitHub' })).toBeEnabled()
  expect(calls).toBe(0)
  await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/github-native-installation.png') })
  const button = page.getByRole('button', { name: 'Install on GitHub' })
  await button.click()
  await expect(button).toBeDisabled()
  expect(calls).toBe(1)
  release!()
  await expect(page).toHaveURL(installUrl)
  await expect(page.getByRole('heading', { name: 'GitHub installation fixture' })).toBeVisible()
})

for (const status of [400, 401, 404]) {
  test(`native issuance ${status} stays visible and never falls back to a state-free link`, async ({ page }) => {
    let calls = 0
    await page.route(`${endpoint}/installation-url`, route => {
      calls++
      return route.fulfill({ status, json: { detail: `issuance denied ${status}` } })
    })
    await mount(page)
    await page.getByRole('button', { name: 'Install on GitHub' }).click()
    await expect(page.getByRole('region', { name: 'GitHub App connection', exact: true }).getByText(`issuance denied ${status}`, { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Install on GitHub' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Install on GitHub' })).toBeEnabled()
    expect(calls).toBe(1)
    await expect(page).toHaveURL(/e2e-fixtures/)
  })
}

test('native installation rejects unsafe destinations and mismatched or absent state', async ({ page }) => {
  let issued = { state, installUrl }
  let navigations = 0
  await page.route(`${endpoint}/installation-url`, route => route.fulfill({ json: issued }))
  await page.route('https://github.com/**', route => { navigations++; return route.abort() })
  await page.route('https://evil.test/**', route => { navigations++; return route.fulfill({ contentType: 'text/html', body: '<h1>Blocked destination fixture</h1>' }) })
  await mount(page)
  for (const url of [
    'https://evil.test/apps/fixture/installations/new?state=fixture-signed-state',
    installUrl.replace('https:', 'http:'), installUrl.replace('github.com', 'user@github.com'),
    installUrl.replace('/apps/fixture/', '/apps/fixture/extra/'), `${installUrl}#fragment`,
    `${installUrl}&state=${state}`, `${installUrl}&redirect=https://evil.test`,
    installUrl.replace(state, 'different'), 'https://github.com/apps/fixture/installations/new',
  ]) {
    issued = { state, installUrl: url }
    await page.getByRole('button', { name: 'Install on GitHub' }).click()
    await expect(page.getByRole('region', { name: 'GitHub App connection', exact: true }).getByText('Invalid GitHub installation URL', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Install on GitHub' })).toBeEnabled()
    await expect(page).toHaveURL(/e2e-fixtures/)
  }
  expect(navigations).toBe(0)
})

test('legacy TypeScript flow retains its link and authenticated manual installation', async ({ page }) => {
  let issues = 0
  let bindings = 0
  await page.route(`${endpoint}/installation-url`, route => { issues++; return route.abort() })
  await page.route(`${endpoint}/installation`, route => {
    bindings++
    expect(route.request().method()).toBe('POST')
    expect(route.request().headers().authorization).toBe('Bearer github-browser-fixture')
    expect(route.request().postDataJSON()).toEqual({ installationId: '99' })
    return route.fulfill({ json: { connection: { ...connection, installationId: '99' } } })
  })
  await mount(page, false)
  const link = page.getByRole('link', { name: 'Install on GitHub' })
  await expect(link).toHaveAttribute('href', 'https://github.com/apps/fixture/installations/new')
  await expect(link).toHaveAttribute('target', '_blank')
  await page.getByRole('textbox', { name: 'GitHub App installation id' }).fill('99')
  await page.getByRole('button', { name: 'Bind installation' }).click()
  await expect(page.getByRole('textbox', { name: 'GitHub App installation id' })).toHaveValue('')
  expect(bindings).toBe(1)
  expect(issues).toBe(0)
})

test('native capability survives verification and manual binding remains available', async ({ page }) => {
  let bindings = 0
  await page.route(`${endpoint}/verify`, route => route.fulfill({ json: { connection, app: { id: '123', slug: 'fixture', name: 'Fixture App', owner: null } } }))
  await page.route(`${endpoint}/installation`, route => {
    bindings++
    return route.fulfill({ json: { connection } })
  })
  await mount(page)
  await page.getByRole('button', { name: 'Verify with GitHub', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Install on GitHub' })).toBeEnabled()
  await page.getByRole('textbox', { name: 'GitHub App installation id' }).fill('99')
  await page.getByRole('button', { name: 'Bind installation' }).click()
  await expect(page.getByRole('textbox', { name: 'GitHub App installation id' })).toHaveValue('')
  expect(bindings).toBe(1)
})

test('connected native App does not offer another installation', async ({ page }) => {
  await mount(page, true, true)
  await expect(page.getByRole('button', { name: 'Install on GitHub' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Install on GitHub' })).toHaveCount(0)
})
