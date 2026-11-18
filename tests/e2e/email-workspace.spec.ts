import path from 'node:path'
import { expect, test } from '@playwright/test'
test.use({ screenshot: 'off' })

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPt0AAAAASUVORK5CYII='
const html = `<meta http-equiv="refresh" content="0;url=https://tracker.example.test/redirect"><base href="https://tracker.example.test"><script>parent.emailCompromised=true</script><form action="https://tracker.example.test/form"><input name="password"></form><iframe src="https://tracker.example.test/frame"></iframe><style>@import url('https://tracker.example.test/style');</style><table style="border-collapse:collapse;width:900px;min-width:900px;font-family:Arial"><tr><td>averylongunbrokentextaverylongunbrokentextaverylongunbrokentextaverylongunbrokentext</td></tr><tr><td style="background:#2563eb;color:white;padding:22px"><h1>Welcome aboard</h1></td></tr><tr><td style="padding:20px"><p>This email keeps its <b>formatting</b> inside chat.</p><img alt="Embedded logo" width="40" height="40" src="${pixel}"><img alt="External banner" src="https://tracker.example.test/banner.png"><img alt="Private host" src="http://127.0.0.1:9999/private"><a href="javascript:parent.emailCompromised=true">Unsafe link</a><a href="https://example.com">Read more</a></td></tr></table>`
const message = { id: 'm1', from: 'Team <team@example.test>', to: 'me@example.test', cc: '', subject: 'Welcome aboard', snippet: 'Welcome to the team', date: '2026-10-16T12:00:00Z', unread: false, labels: ['INBOX'], hasAttachments: false, bodyText: 'Welcome aboard', bodyHtml: html }

for (const width of [390, 1280]) {
  test(`email accounts, signatures and safe rendered chat at ${width}px`, async ({ page }) => {
    test.setTimeout(60_000)
    await page.setViewportSize({ width, height: 900 })
    const accounts = [
      { id: 'personal', userId: 'test', provider: 'gmail', email: 'personal@example.test', displayName: 'Personal', status: 'connected', signature: 'Alice\nPersonal signature', signatureEnabled: true, createdAt: '', updatedAt: '' },
      { id: 'work', userId: 'test', provider: 'imap', email: 'work@example.test', displayName: 'Work', status: 'connected', signature: 'Alice\nWork signature', signatureEnabled: true, createdAt: '', updatedAt: '' },
    ]
    let sent: Record<string, unknown> | null = null
    let requestedImages: Record<string, unknown> | null = null
    const externalRequests: string[] = []
    // Chromium emits 'request' even when CSP blocks it before network access.
    // Interception catches actual network attempts and prevents fixture traffic.
    await page.route(/^https?:\/\/(?:tracker\.example\.test|127\.0\.0\.1:9999)(?:\/|$)/, route => {
      externalRequests.push(route.request().url())
      return route.abort()
    })
    await page.addInitScript(({ message }) => {
      localStorage.setItem('jait-gateway-url', window.location.origin)
      ;(window as unknown as { emailFixture: unknown }).emailFixture = message
    }, { message })
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url())
      const method = route.request().method()
      if (url.pathname === '/api/email/accounts' && method === 'GET') return route.fulfill({ json: { accounts } })
      if (url.pathname === '/api/email/config') return route.fulfill({ json: { providers: { gmail: true, outlook: true } } })
      if (url.pathname.startsWith('/api/email/accounts/') && method === 'PATCH') {
        const account = accounts.find(account => account.id === url.pathname.split('/').pop())!
        Object.assign(account, route.request().postDataJSON())
        return route.fulfill({ json: { account } })
      }
      if (url.pathname === '/api/email/folders') return route.fulfill({ json: { folders: [] } })
      if (url.pathname === '/api/email/messages') return route.fulfill({ json: { account: { id: url.searchParams.get('accountId') }, messages: [{ ...message, subject: url.searchParams.get('accountId') === 'work' ? 'Work inbox' : 'Welcome aboard' }] } })
      if (url.pathname === '/api/email/messages/m1') return route.fulfill({ json: { message } })
      if (url.pathname === '/api/email/send') { sent = route.request().postDataJSON(); return route.fulfill({ json: { ok: true, id: 'sent' } }) }
      if (url.pathname === '/api/email/images') { requestedImages = route.request().postDataJSON(); return route.fulfill({ json: { images: { 'https://tracker.example.test/banner.png': pixel } } }) }
      return route.fulfill({ json: { providers: [], models: [], skills: [], user: null } })
    })
    await page.goto('/src/e2e-fixtures/email-workspace.html')
    await expect(page.getByRole('button', { name: /Welcome aboard/ })).toBeVisible()
    if (width === 390) {
      await page.getByRole('button', { name: /Welcome aboard/ }).click()
      const frame = page.frameLocator('iframe[title="Email content"]')
      await expect(frame.getByRole('heading', { name: 'Welcome aboard' })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      expect(await frame.locator('html').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
      await page.getByRole('button').filter({ has: page.locator('svg.lucide-arrow-left') }).click()
    }
    await page.getByRole('combobox', { name: 'Email account' }).click()
    await page.getByRole('option', { name: 'work@example.test' }).click()
    await expect(page.getByRole('button', { name: /Work inbox/ })).toBeVisible()
    await page.getByRole('button', { name: 'Accounts & signatures', exact: true }).click()
    const manager = page.getByRole('dialog', { name: 'Email accounts & signatures' })
    await expect(manager.getByText('personal@example.test', { exact: true })).toBeVisible()
    const editor = manager.getByRole('region', { name: 'Settings for work@example.test' })
    await editor.getByLabel('Signature for work@example.test').fill('Alice\nUpdated work signature')
    await editor.getByRole('button', { name: 'Save signature' }).click()
    await expect.poll(() => accounts[1].signature).toBe('Alice\nUpdated work signature')
    await expect(manager.getByRole('button', { name: 'Connect Gmail / Google Workspace' })).toBeEnabled()
    await manager.getByRole('button', { name: 'Connect another provider' }).click()
    await expect(manager.getByRole('button', { name: 'Verify and add account' })).toBeVisible()
    await expect(manager.getByText('Automatic setup sends only the email domain', { exact: false })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Compose', exact: true }).click()
    const compose = page.getByRole('dialog', { name: 'New message', exact: true })
    await expect(compose.getByRole('combobox', { name: 'From account' })).toContainText('work@example.test')
    await expect(compose.getByText('Updated work signature', { exact: false })).toBeVisible()
    await compose.getByLabel('To', { exact: true }).fill('recipient@example.test')
    await compose.getByLabel('Subject', { exact: true }).fill('Fixture only')
    await compose.getByLabel('Message body').fill('Draft body')
    await compose.getByLabel('Include account signature').uncheck()
    await compose.getByRole('button', { name: 'Send', exact: true }).click()
    await expect.poll(() => sent).toMatchObject({ accountId: 'work', includeSignature: false, body: 'Draft body' })
    await expect(compose).not.toBeVisible()

    await page.goto('/src/e2e-fixtures/email-workspace.html?preview=chat')
    const preview = page.getByRole('article', { name: 'Email preview' })
    await expect(preview).toBeVisible()
    const frame = preview.frameLocator('iframe[title="Email content"]')
    await expect(frame.getByRole('heading', { name: 'Welcome aboard' })).toBeVisible()
    await expect(frame.locator('b')).toHaveText('formatting')
    await expect(frame.getByAltText('Embedded logo')).toHaveAttribute('src', pixel)
    await expect(frame.getByAltText('External banner')).not.toHaveAttribute('src')
    await expect(frame.getByAltText('Private host')).not.toHaveAttribute('src')
    await expect(frame.locator('script, form, input, iframe, meta[http-equiv="refresh"]')).toHaveCount(0)
    await expect(frame.getByText('Unsafe link')).not.toHaveAttribute('href')
    expect(externalRequests).toEqual([])
    expect(await page.evaluate(() => (window as unknown as { emailCompromised?: boolean }).emailCompromised)).toBeUndefined()
    await preview.getByRole('button', { name: 'Load images', exact: true }).click()
    await expect.poll(() => requestedImages).toEqual({ accountId: 'personal', urls: ['https://tracker.example.test/banner.png'] })
    await expect(frame.getByAltText('External banner')).toHaveAttribute('src', pixel)
    expect(externalRequests).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/', `email-chat-${width}.png`) })
  })
}

test('mobile inbox shows cached mail while fresh mail loads', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => localStorage.setItem('jait-gateway-url', window.location.origin))
  let releaseFresh!: () => void
  const freshReady = new Promise<void>(resolve => { releaseFresh = resolve })
  const account = { id: 'personal', userId: 'test', provider: 'gmail', email: 'personal@example.test', status: 'connected', createdAt: '', updatedAt: '' }
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/email/accounts') return route.fulfill({ json: { accounts: [account] } })
    if (url.pathname === '/api/email/config') return route.fulfill({ json: { providers: { gmail: true, outlook: true } } })
    if (url.pathname === '/api/email/folders') return route.fulfill({ json: { folders: [] } })
    if (url.pathname === '/api/email/messages' && url.searchParams.has('cached')) return route.fulfill({ json: { messages: [message] } })
    if (url.pathname === '/api/email/messages') {
      await freshReady
      return route.fulfill({ json: { account, messages: [{ ...message, id: 'm2', subject: 'Fresh mail' }, message] } })
    }
    if (url.pathname === '/api/email/messages/m1') return route.fulfill({ json: { message } })
    return route.fulfill({ json: {} })
  })
  await page.goto('/src/e2e-fixtures/email-workspace.html')
  await expect(page.getByRole('button', { name: /Welcome aboard/ })).toBeVisible()
  releaseFresh()
  await expect(page.getByRole('button', { name: /Fresh mail/ })).toBeVisible()
  await page.getByRole('button', { name: /Welcome aboard/ }).click()
  const frame = page.locator('iframe[title="Email content"]')
  await expect(frame).toBeVisible()
  expect((await frame.boundingBox())!.height).toBeGreaterThan(500)
})
