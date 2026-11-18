import { expect, test, type Page } from '@playwright/test'
import { registerAgentTestUser } from './helpers/agent-user'

const api = process.env.API_URL || 'http://127.0.0.1:8100'

// Exercise the same navigation handler used when a rendered jait.link is clicked.
async function followAgentLink(page: Page, link: string) {
  await page.evaluate(async (link) => {
    const modulePath = '/src/lib/notification-navigation.ts'
    const { openNotification } = await import(modulePath)
    openNotification({ id: `search:${link}`, link })
  }, link)
  await expect.poll(() => page.url().includes(link)).toBe(true)
}

test.beforeEach(async ({ page, request }) => {
  const token = await registerAgentTestUser(request, api, `search-links-${Date.now()}`, 'search-link-test-password')
  await page.context().addCookies([{ name: 'jait_token', value: token, url: api, httpOnly: true, sameSite: 'Lax' }])
  await page.addInitScript(({ token, api }) => {
    localStorage.setItem('jait-auth-token', token)
    sessionStorage.setItem('jait-auth-token', token)
    localStorage.setItem('jait-gateway-url', api)
    localStorage.setItem('jait.settings.activeTab', 'api')
    sessionStorage.setItem('jait.settings.search', 'old saved search')
  }, { token, api })
  await page.addLocatorHandler(page.getByRole('heading', { name: 'Set up your first project', exact: true }), async () => {
    await page.getByRole('button', { name: 'Skip for now', exact: true }).click()
  })
})

test('settings links override saved state, filter nested searches, and restore history', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/settings?q=providers&tab=api', { waitUntil: 'domcontentloaded' })
  const search = page.getByPlaceholder('Search settings...')
  await expect(search).toHaveValue('providers', { timeout: 30_000 })
  await expect(page.getByRole('tab', { name: 'API', exact: true })).toHaveAttribute('data-state', 'active')
  await followAgentLink(page, '/settings?q=&tab=tools&toolsQ=jait.link')
  const tools = page.getByPlaceholder('Filter tools...')
  await expect(search).toHaveValue('')
  await expect(tools).toHaveValue('jait.link')
  await expect(page.getByRole('switch', { name: 'Toggle jait.link', exact: true })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Toggle file.read', exact: true })).toHaveCount(0)
  await tools.fill('file.read')
  await expect(page.getByRole('switch', { name: 'Toggle file.read', exact: true })).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.get('toolsQ')).toBe('file.read')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(tools).toHaveValue('file.read')
  await expect(search).toHaveValue('')
  await followAgentLink(page, '/settings?q=providers&tab=api')
  await expect(search).toHaveValue('providers')
  await page.goBack()
  await expect(tools).toHaveValue('file.read')
  await expect(search).toHaveValue('')
  await page.goForward()
  await expect(search).toHaveValue('providers')
  await page.route('**/api/store/skills?**', route => route.fulfill({ json: { results: [] } }))
  await followAgentLink(page, '/settings?q=&tab=skills&skillsTab=marketplace&marketplaceQ=network')
  await expect(page.getByPlaceholder('Search ClawHub skills...')).toHaveValue('network')
})

test('mail search links apply provider queries on load and same-page navigation', async ({ page }) => {
  test.setTimeout(90_000)
  const searches: Array<{ q: string | null; account: string | null; folder: string | null }> = []
  await page.route('**/api/email/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/accounts')) return route.fulfill({ json: { accounts: [
      { id: 'first', provider: 'gmail', email: 'first@example.test' },
      { id: 'second', provider: 'outlook', email: 'second@example.test' },
    ] } })
    if (url.pathname.endsWith('/config')) return route.fulfill({ json: { providers: { gmail: true, outlook: true } } })
    if (url.pathname.endsWith('/folders')) return route.fulfill({ json: { folders: [] } })
    if (url.pathname.endsWith('/messages')) {
      const q = url.searchParams.get('q')
      searches.push({ q, account: url.searchParams.get('accountId'), folder: url.searchParams.get('folder') })
      return route.fulfill({ json: { messages: [{ id: q || 'all', from: 'Sender <sender@example.test>', to: '',
        subject: q || 'All mail', snippet: '', date: '2026-01-01', labels: [], unread: false, hasAttachments: false }] } })
    }
    return route.fulfill({ json: {} })
  })
  const query = 'from:alice+work@example.test subject:"München & budget"'
  await page.goto('/emails?' + new URLSearchParams({ q: query, accountId: 'second', folder: 'sent' }), { waitUntil: 'domcontentloaded' })
  const search = page.getByPlaceholder('Search mail')
  await expect(search).toHaveValue(query, { timeout: 30_000 })
  await expect(page.getByText(query, { exact: true })).toBeVisible()
  expect(searches.at(-1)).toEqual({ q: query, account: 'second', folder: 'sent' })
  await followAgentLink(page, '/emails?q=invoice&accountId=first&folder=inbox')
  await expect(search).toHaveValue('invoice')
  await expect(page.getByText('invoice', { exact: true })).toBeVisible()
  expect(searches.at(-1)).toEqual({ q: 'invoice', account: 'first', folder: 'inbox' })
  await search.fill('manual search')
  await search.press('Enter')
  await expect(page.getByText('manual search', { exact: true })).toBeVisible()
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('manual search')
  await page.goBack()
  await expect(search).toHaveValue(query)
  await expect(page.getByText(query, { exact: true })).toBeVisible()
  await followAgentLink(page, '/emails?q=&accountId=second&folder=sent')
  await expect(search).toHaveValue('')
  await expect(page.getByText('All mail', { exact: true })).toBeVisible()
})
