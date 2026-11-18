import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/update/nodes', route => route.fulfill({ json: { nodes: [] } }))
})

test('shows node versions and applies an available gateway update', async ({ page }) => {
  let updateBody: unknown
  await page.route('**/api/network/topology', route => route.fulfill({ json: {
    gateway: { id: 'gateway', type: 'gateway', name: 'Main gateway', ip: '192.168.1.1', platform: 'linux', providers: [], online: true, version: '1.2.3' },
    devices: [{ id: 'phone', type: 'device', name: 'Phone', platform: 'android', online: true, ip: '192.168.1.3' }], hosts: [], meshNodes: [
      { id: 'remote', type: 'node', name: 'Remote node', ip: '192.168.1.2', platform: 'linux', providers: [], online: false, version: '' },
    ], resources: [], scannedAt: '2026-10-15T10:00:00Z', inventory: { status: 'available', truncated: false },
  } }))
  await page.route('**/api/update/check', route => route.fulfill({ json: { currentVersion: '1.2.3', latestVersion: '1.2.4', hasUpdate: true } }))
  await page.route('**/api/update/apply', route => {
    expect(route.request().headers().authorization).toBe('Bearer fixture')
    updateBody = route.request().postDataJSON()
    return route.fulfill({ json: { ok: true } })
  })
  await page.goto('/src/e2e-fixtures/network-resources.html')
  const nodes = page.getByRole('complementary', { name: 'Jait nodes', exact: true })
  if (!(await nodes.isVisible())) await page.getByRole('button', { name: 'Jait nodes' }).click()
  await expect(nodes.getByText('Version v1.2.3 · Online')).toBeVisible()
  await expect(nodes.getByText('Update available: v1.2.4')).toBeVisible()
  await expect(nodes.getByText('Phone')).toBeVisible()
  await expect(nodes.getByText('Connected device · Version unknown')).toBeVisible()
  await expect(nodes.getByText('Updates are not available here.', { exact: true })).toBeVisible()
  await expect(nodes.getByText('Remote node')).toBeVisible()
  await expect(nodes.getByText('Version unknown', { exact: true })).toBeVisible()
  await expect(nodes.getByText('Update unavailable while offline.')).toBeVisible()
  await nodes.getByRole('button', { name: 'Update', exact: true }).click()
  await expect(nodes.getByRole('status')).toContainText('gateway will restart')
  expect(updateBody).toEqual({ version: '1.2.4' })
})

test('shows an update failure without claiming success', async ({ page }) => {
  await page.route('**/api/network/topology', route => route.fulfill({ json: {
    gateway: { id: 'gateway', type: 'gateway', name: 'Main gateway', ip: '192.168.1.1', platform: 'linux', providers: [], online: true, version: '1.2.3' },
    devices: [], hosts: [], meshNodes: [], resources: [], scannedAt: '2026-10-15T10:00:00Z', inventory: { status: 'available', truncated: false },
  } }))
  await page.route('**/api/update/check', route => route.fulfill({ json: { currentVersion: '1.2.3', latestVersion: '1.2.4', hasUpdate: true } }))
  await page.route('**/api/update/apply', route => route.fulfill({ status: 409, json: { error: 'Web updates require a systemd-managed gateway.' } }))
  await page.goto('/src/e2e-fixtures/network-resources.html')
  const nodes = page.getByRole('complementary', { name: 'Jait nodes', exact: true })
  if (!(await nodes.isVisible())) await page.getByRole('button', { name: 'Jait nodes' }).click()
  await nodes.getByRole('button', { name: 'Update', exact: true }).click()
  await expect(nodes.getByRole('status')).toHaveText('Web updates require a systemd-managed gateway.')
  await expect(nodes.getByRole('button', { name: 'Update', exact: true })).toBeEnabled()
})

test('explains when the gateway cannot update itself', async ({ page }) => {
  await page.route('**/api/network/topology', route => route.fulfill({ json: {
    gateway: { id: 'gateway', type: 'gateway', name: 'Main gateway', ip: '192.168.1.1', platform: 'linux', providers: [], online: true, version: '1.2.3' },
    devices: [], hosts: [], meshNodes: [], resources: [], scannedAt: '2026-10-15T10:00:00Z', inventory: { status: 'available', truncated: false },
  } }))
  await page.route('**/api/update/check', route => route.fulfill({ json: { currentVersion: '1.2.3', latestVersion: '1.2.4', hasUpdate: true, canApply: false } }))
  await page.goto('/src/e2e-fixtures/network-resources.html')
  const nodes = page.getByRole('complementary', { name: 'Jait nodes', exact: true })
  if (!(await nodes.isVisible())) await page.getByRole('button', { name: 'Jait nodes', exact: true }).click()
  await expect(nodes.getByText('Automatic updates require a systemd-managed gateway.')).toBeVisible()
  await expect(nodes.getByRole('button', { name: 'Update', exact: true })).toHaveCount(0)
})

test('updates a permitted paired gateway and reports unknown outcomes', async ({ page }) => {
  let body: unknown
  await page.route('**/api/network/topology', route => route.fulfill({ json: {
    gateway: { id: 'gateway', type: 'gateway', name: 'Main gateway', ip: '192.168.1.1', platform: 'linux', providers: [], online: true, version: '1.2.4' },
    devices: [{ id: 'device-node-1', type: 'device', name: 'Remote gateway', platform: 'linux', providers: [], online: true }], hosts: [], meshNodes: [], resources: [], scannedAt: null,
  } }))
  await page.route('**/api/update/check', route => route.fulfill({ json: { currentVersion: '1.2.4', latestVersion: '1.2.4', hasUpdate: false } }))
  await page.route('**/api/update/nodes', route => route.fulfill({ json: { nodes: [
    { id: 'node-1', name: 'Remote gateway', appVersion: '1.2.3', online: true, granted: true },
    { id: 'node-2', name: 'Denied gateway', appVersion: '1.2.3', online: true, granted: false },
    { id: 'node-3', name: 'Offline gateway', appVersion: '1.2.3', online: false, granted: true },
  ] } }))
  await page.route('**/api/update/nodes/node-1/apply', route => {
    expect(route.request().headers().authorization).toBe('Bearer fixture')
    body = route.request().postDataJSON()
    return route.fulfill({ status: 502, json: { error: 'Node disconnected' } })
  })
  await page.goto('/src/e2e-fixtures/network-resources.html')
  const panel = page.getByRole('complementary', { name: 'Jait nodes', exact: true })
  if (!(await panel.isVisible())) await page.getByRole('button', { name: 'Jait nodes', exact: true }).click()
  const remote = panel.locator('section').filter({ hasText: 'Remote gateway' })
  await expect(remote).toHaveCount(1)
  await expect(remote.getByText('Update available: v1.2.4')).toBeVisible()
  await expect(panel.locator('section').filter({ hasText: 'Denied gateway' }).getByText('Allow updates for this node in', { exact: false })).toBeVisible()
  await expect(panel.locator('section').filter({ hasText: 'Offline gateway' }).getByText('Update unavailable while offline.')).toBeVisible()
  await remote.getByRole('button', { name: 'Update', exact: true }).click()
  expect(body).toEqual({ version: '1.2.4' })
  await expect(remote.getByRole('status')).toContainText('outcome unknown')
  await expect(remote.getByRole('button', { name: 'Update', exact: true })).toBeDisabled()
})
