import { expect, test } from '@playwright/test'

test('shows organizations under their account and starts the selected tenant login', async ({ page }) => {
  const accountId = '8:orgid:11111111-1111-1111-1111-111111111111'
  const tenantId = '22222222-2222-4222-8222-222222222222'
  await page.route('**/api/messenger/bridge-status', route => route.fulfill({ json: {
    bridges: [{ platform: 'teams', label: 'Microsoft Teams', state: 'connected', checkedAt: new Date().toISOString(),
      accounts: [{ id: accountId, name: 'Account', signInEmail: 'sam@example.com', state: 'expired', tenants: [
        { id: tenantId, name: 'Example organization', connected: false, state: 'expired' },
      ] }],
    }],
  } }))
  const requests: (string | null)[] = []
  await page.route('**/api/messenger/bridge-reauth/teams', route => {
    if (route.request().method() === 'POST') requests.push(route.request().postData())
    return route.fulfill({ json: { phase: 'starting', message: 'Starting', liveViewUrl: null } })
  })
  await page.goto('/src/e2e-fixtures/teams-tenant.html')
  const list = page.getByRole('list', { name: 'Organizations for Account' })
  await expect(list).toContainText('Example organization')
  await expect(list).toContainText('Auth timed out')
  await list.getByRole('button', { name: 'Sign in again' }).click()
  await expect(page.getByRole('dialog')).toContainText('Sign in to Example organization')
  await expect.poll(() => requests[0] && JSON.parse(requests[0])).toEqual({ accountId, tenantId, signInEmail: 'sam@example.com' })
  await page.keyboard.press('Escape')
  await page.getByRole('list', { name: 'Teams accounts' }).getByRole('button', { name: 'Sign in again' }).first().click()
  await expect.poll(() => requests[1] && JSON.parse(requests[1])).toEqual({ signInEmail: 'sam@example.com' })
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Add Teams account' }).click()
  await expect.poll(() => requests[2]).toBeNull()
})
