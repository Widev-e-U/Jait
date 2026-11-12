import { expect, test } from '@playwright/test'

test('shows organizations under their account and starts the selected tenant login', async ({ page }) => {
  const accountId = '8:orgid:11111111-1111-1111-1111-111111111111'
  const tenantId = '22222222-2222-4222-8222-222222222222'
  await page.route('**/api/messenger/bridge-status', route => route.fulfill({ json: {
    bridges: [{ platform: 'teams', label: 'Microsoft Teams', state: 'connected', checkedAt: new Date().toISOString(),
      accounts: [{ id: accountId, name: 'Account', state: 'connected', tenants: [
        { id: tenantId, name: 'Example organization', connected: false },
      ] }],
    }],
  } }))
  let requested: unknown
  await page.route('**/api/messenger/bridge-reauth/teams', route => {
    if (route.request().method() === 'POST') requested = route.request().postDataJSON()
    return route.fulfill({ json: { phase: 'starting', message: 'Starting', liveViewUrl: null } })
  })
  await page.goto('/src/e2e-fixtures/teams-tenant.html')
  const list = page.getByRole('list', { name: 'Organizations for Account' })
  await expect(list).toContainText('Example organization')
  await list.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('dialog')).toContainText('Sign in to Example organization')
  await expect.poll(() => requested).toEqual({ accountId, tenantId })
})
