import path from 'node:path'
import { expect, test } from '@playwright/test'

// The first Vite request may optimize dependencies on a fresh checkout.
test.setTimeout(120_000)

for (const width of [1280, 390]) {
  test(`Docker resources have meaningful identity and expandable groups at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    let unavailable = false
    const container = (name: string, category: string, icon: string) => ({
      id: `docker-${name}`, type: 'resource', kind: 'container', name,
      parentId: 'gateway', icon, category, online: true, status: 'running',
      source: 'Local Docker inventory', observedAt: '2026-10-15T10:00:00Z', addresses: ['172.17.0.2'],
      facts: [{ label: 'Image', value: category === 'sandbox' ? 'jait/sandbox:latest' : 'nginx:alpine' }, { label: 'Access', value: 'Metadata available' }],
    })
    await page.route('**/api/network/topology', route => route.fulfill({ json: {
      gateway: { id: 'gateway', type: 'gateway', name: 'movable-base', ip: '192.168.178.60', platform: 'linux', providers: [], online: true, version: '0.1.936' },
      devices: [], hosts: [], meshNodes: [], scannedAt: '2026-10-15T10:00:00Z',
      resources: unavailable ? [] : [container('sandbox-alpha', 'sandbox', 'jait'), container('sandbox-beta', 'sandbox', 'jait'), container('web-server', 'application', 'nginx')],
      inventory: { status: unavailable ? 'unavailable' : 'available', truncated: false },
    } }))
    await page.goto('/src/e2e-fixtures/network-resources.html')
    const panel = page.locator('#network-resource-fixture')
    await expect(panel.getByLabel('Visible graph nodes')).toHaveText('3 shown')
    await panel.getByLabel('Inspect resource').selectOption('group-jait-sandboxes')
    await expect(panel.getByText('Jait sandboxes · 2', { exact: true }).last()).toBeVisible()
    await expect(panel.getByLabel('Sandbox resources').getByRole('button')).toHaveCount(2)
    await panel.getByLabel('Find sandbox').fill('alpha')
    await expect(panel.getByLabel('Sandbox resources').getByRole('button')).toHaveCount(1)
    await panel.getByLabel('Sandbox resources').getByRole('button').click()
    await expect(panel.getByText('jait/sandbox:latest', { exact: true })).toBeVisible()
    await expect(panel.getByRole('img', { name: 'jait logo' })).toBeVisible()
    // A hidden group member stays selected across graph recomputation.
    await expect(panel.getByText('Metadata available', { exact: true })).toBeVisible()
    await panel.getByLabel('Inspect resource').selectOption('docker-web-server')
    await expect(panel.getByRole('img', { name: 'nginx logo' })).toBeVisible()
    await expect(panel.getByText('nginx:alpine', { exact: true })).toBeVisible()
    await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/', `network-resource-details-${width}.png`) })
    await panel.getByRole('button', { name: 'Close node details' }).click()
    await panel.getByRole('button', { name: 'Expand sandboxes', exact: true }).click()
    await expect(panel.getByLabel('Visible graph nodes')).toHaveText('5 shown')
    await panel.getByRole('button', { name: 'Collapse sandboxes', exact: true }).click()
    await expect(panel.getByLabel('Visible graph nodes')).toHaveText('3 shown')
    await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/', `network-resources-${width}.png`) })
    const refreshBounds = await panel.getByRole('button', { name: 'Refresh', exact: true }).boundingBox()
    expect(refreshBounds!.x + refreshBounds!.width).toBeLessThanOrEqual(width)
    unavailable = true
    await panel.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(panel.getByRole('status')).toHaveText('Docker inventory unavailable; showing network discoveries.')
  })
}
