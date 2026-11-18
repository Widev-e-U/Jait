import path from 'node:path'
import { readFileSync } from 'node:fs'
import { createHmac, randomBytes } from 'node:crypto'
import { expect, test, type Page, type APIRequestContext } from '@playwright/test'

test.setTimeout(60_000)
test.use({ screenshot: 'off' })
test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/messenger-failure-' + info.title.replace(/[^a-z0-9]+/gi, '-').slice(0, 100) + '.png'), timeout: 5000 }).catch(() => {})
})

async function mount(page: Page) {
  await page.goto('/src/e2e-fixtures/messenger.html', { waitUntil: 'domcontentloaded' })
  // The shell is a labelled region. The standalone <h1>Messenger</h1> gate was
  // replaced by the inbox headline when the messenger layout was rebuilt, so the
  // fixture is gated on the region that identifies the page in every state.
  await expect(page.getByRole('region', { name: 'Messenger', exact: true })).toBeVisible({ timeout: 30_000 })
}

for (const width of [1280, 390, 320]) {
  test('Matrix sign-in layout at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: 850 })
    await mount(page)
    await expect(page.getByLabel('Homeserver URL')).toBeVisible()
    await expect(page.getByText('Messages are not sent to AI unless you enable assistant access', { exact: false })).toBeVisible()
    await page.getByRole('button', { name: 'Use a device access token (SSO accounts)' }).click()
    await expect(page.getByLabel('Device access token')).toBeVisible()
    await expect(page.getByLabel('Matrix password')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/messenger-connect-' + width + '.png') })
  })
}

test('rejects insecure server URLs before sending credentials', async ({ page }) => {
  let requests = 0
  await page.route('http://192.168.1.12/**', route => { requests++; return route.abort() })
  await mount(page)
  await page.getByLabel('Homeserver URL').fill('http://192.168.1.12:8008')
  await page.getByLabel('Matrix username').fill('alice')
  await page.getByLabel('Matrix password').fill('private-password')
  await page.getByRole('button', { name: 'Connect Matrix', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Use HTTPS')
  await expect(page.getByLabel('Matrix password')).toHaveValue('')
  expect(requests).toBe(0)
})

test.describe('real Synapse integration', () => {
  test.skip(process.env.JAIT_MATRIX_INTEGRATION !== '1', 'Requires isolated Matrix runtime; see docs/messenger.md.')
  test.setTimeout(120_000)
  const server = 'http://127.0.0.1:18008'

  async function account(request: APIRequestContext, prefix: string) {
    const username = prefix + '-' + randomBytes(5).toString('hex')
    const password = randomBytes(24).toString('base64url')
    const config = readFileSync(path.resolve(__dirname, '../../.jait/artifacts/matrix-validation/homeserver.yaml'), 'utf8')
    const secret = config.match(/^registration_shared_secret: ['"]?([^'"\r\n]+)['"]?$/m)?.[1]
    if (!secret) throw new Error('Missing isolated test registration secret.')
    const nonce = (await (await request.get(server + '/_synapse/admin/v1/register')).json()).nonce
    const mac = createHmac('sha1', secret).update(nonce + '\0' + username + '\0' + password + '\0notadmin').digest('hex')
    const response = await request.post(server + '/_synapse/admin/v1/register', { data: { nonce, username, password, mac, admin: false, inhibit_login: false } })
    expect(response.ok()).toBe(true)
    const auth = await response.json()
    return { username, password, userId: auth.user_id as string, headers: { Authorization: 'Bearer ' + auth.access_token } }
  }

  async function signIn(page: Page, credentials: { username: string; password: string }) {
    await mount(page)
    await page.getByLabel('Homeserver URL').fill(server)
    await page.getByLabel('Matrix username').fill(credentials.username)
    await page.getByLabel('Matrix password').fill(credentials.password)
    await page.getByRole('button', { name: 'Connect Matrix', exact: true }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Connected' })).toBeVisible({ timeout: 45_000 })
  }

  test('encrypted replies, attachments, invitations, service filters, reconnect, and disconnect', async ({ page, browser, request }) => {
    await expect.poll(async () => { try { return (await request.get(server + '/_matrix/client/versions')).ok() } catch { return false } }, { timeout: 30_000 }).toBe(true)
    const alice = await account(request, 'alice')
    const bob = await account(request, 'bob')
    const created = await request.post(server + '/_matrix/client/v3/createRoom', {
      headers: alice.headers,
      data: { name: 'Homelab messages', preset: 'private_chat', invite: [bob.userId], initial_state: [
        { type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } },
        { type: 'm.bridge', state_key: 'fixture', content: { protocol: { id: 'whatsapp', displayname: 'WhatsApp' }, network: { displayname: 'Personal' } } },
      ] },
    })
    expect(created.ok()).toBe(true)
    const roomId = (await created.json()).room_id as string
    const otherContext = await browser.newContext()
    const other = await otherContext.newPage()
    const gatewayRequests: string[] = []
    for (const context of [page.context(), otherContext]) {
      context.on('request', request => {
        if (new URL(request.url()).pathname.startsWith('/api/') && !request.url().endsWith('/api/voice/transcribe-audio')) gatewayRequests.push(request.url())
      })
    }
    try {
      await signIn(page, alice)
      await signIn(other, bob)
      await page.getByRole('button', { name: /Homelab messages/ }).click()
      await other.getByRole('button', { name: /Homelab messages/ }).click()
      await expect(other.getByText('You have been invited')).toBeVisible()
      await other.getByRole('button', { name: 'Accept invitation' }).click()
      await expect(other.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible()
      await expect(page.getByLabel('Encrypted room')).toBeVisible()
      await expect(page.getByTestId('chat-composer')).toHaveAttribute('data-chat-variant', 'messenger')
      await expect(page.locator('[data-chat-composer-surface]')).toBeVisible()
      await expect(page.locator('[data-conversation-scroll]')).toHaveAttribute('role', 'log')
      await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toHaveAttribute('contenteditable', 'true')
      await expect(page.getByRole('button', { name: /Stop generating|Retry from this message|Edit message/ })).toHaveCount(0)
      await page.getByRole('textbox', { name: 'Message', exact: true }).fill('Encrypted hello from Jait')
      await page.getByRole('button', { name: 'Send message', exact: true }).click()
      await expect(other.getByRole('log', { name: 'Messages' }).getByText('Encrypted hello from Jait', { exact: true })).toBeVisible({ timeout: 30_000 })
      await other.bringToFront()
      await expect(page.getByRole('button', { name: 'Read receipts', exact: true })).toBeVisible({ timeout: 30_000 })
      await page.getByRole('button', { name: 'Read receipts', exact: true }).click()
      await expect(page.getByText(/Read (at|by) /, { exact: false })).toBeVisible()
      await page.keyboard.press('Escape')
      await other.getByRole('textbox', { name: 'Message', exact: true }).fill('Encrypted reply')
      await other.getByRole('textbox', { name: 'Message', exact: true }).press('Enter')
      await expect(page.getByRole('log', { name: 'Messages' }).getByText('Encrypted reply', { exact: true })).toBeVisible({ timeout: 30_000 })
      // Clipboard references and remote HTML stay literal in personal conversations.
      const literal = '@alice /help **literal** <img src="https://example.invalid/tracker">'
      const editor = page.getByRole('textbox', { name: 'Message', exact: true })
      await editor.focus()
      await editor.evaluate((element, text) => {
        const clipboard = new DataTransfer()
        clipboard.setData('text/plain', text)
        clipboard.setData('application/x-jait-user-message+json', JSON.stringify([{ type: 'file', path: '/private/local.txt', name: 'local.txt' }]))
        element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }))
      }, literal)
      await expect(editor).toHaveText(literal)
      await expect(editor.locator('[data-chip-ref]')).toHaveCount(0)
      await editor.press('Shift+Enter')
      await editor.pressSequentially('Second line')
      await editor.press('Enter')
      await expect(other.getByRole('log', { name: 'Messages' }).getByText(literal + '\nSecond line', { exact: true })).toBeVisible({ timeout: 30_000 })
      await expect(other.getByRole('log', { name: 'Messages' }).locator('img')).toHaveCount(0)
      await expect(editor).toHaveText('')
      // Use the real recorder/encoder with synthetic audio and a mocked STT response.
      // A delayed transcript belongs to the room where dictation started, even after switching.
      const secondRoom = await request.post(server + '/_matrix/client/v3/createRoom', {
        headers: alice.headers, data: { name: 'Other draft', preset: 'private_chat' },
      })
      expect(secondRoom.ok()).toBe(true)
      await editor.fill('Existing draft')
      await page.evaluate(() => {
        const audio = new AudioContext()
        const tone = audio.createOscillator()
        const destination = audio.createMediaStreamDestination()
        tone.connect(destination)
        tone.start()
        Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => destination.stream })
      })
      let finishTranscription!: () => Promise<void>
      let capturedAudio = false
      await page.route('**/api/voice/transcribe-audio', async route => {
        const body = route.request().postDataJSON()
        capturedAudio = body.provider === 'whisper' && body.sessionId === 'messenger-dictation' && body.audioBase64.length > 64
        finishTranscription = async () => { await route.fulfill({ json: { text: 'Dictated message' } }) }
      })
      await page.getByRole('button', { name: 'Dictate', exact: true }).click()
      await expect(page.getByText('Listening...', { exact: true })).toBeVisible()
      // Accumulate enough audio for the browser decoder.
      await page.waitForTimeout(250)
      await page.getByRole('button', { name: 'Done', exact: true }).click()
      await expect.poll(() => capturedAudio).toBe(true)
      await page.getByRole('button', { name: /Other draft/ }).click()
      await editor.fill('Separate draft')
      await finishTranscription()
      await expect(page.getByRole('button', { name: 'Dictate', exact: true })).toBeVisible()
      await expect(editor).toHaveText('Separate draft')
      await page.getByRole('button', { name: /Homelab messages/ }).click()
      await expect(editor).toHaveText('Existing draft Dictated message')
      await expect(other.getByRole('log', { name: 'Messages' }).getByText('Existing draft Dictated message', { exact: true })).toHaveCount(0)
      await editor.fill('')
      const history = await request.get(server + '/_matrix/client/v3/rooms/' + encodeURIComponent(roomId) + '/messages?dir=b&limit=20', { headers: alice.headers })
      const events = (await history.json()).chunk as Array<{ type: string; content: Record<string, unknown> }>
      expect(events.filter(event => event.type === 'm.room.encrypted').length).toBeGreaterThanOrEqual(2)
      expect(JSON.stringify(events)).not.toContain('Encrypted hello from Jait')
      await page.getByLabel('Attach a file', { exact: true }).setInputFiles({ name: 'hello.txt', mimeType: 'text/plain', buffer: Buffer.from('private attachment') })
      await expect(other.getByRole('log', { name: 'Messages' }).getByText('hello.txt', { exact: true })).toBeVisible({ timeout: 30_000 })
      await other.getByRole('button', { name: 'Load attachment' }).click()
      const downloadPromise = other.waitForEvent('download')
      await other.getByRole('link', { name: 'Download hello.txt' }).click()
      const download = await downloadPromise
      await download.saveAs(path.resolve(__dirname, '../../.jait/artifacts/messenger-download.txt'))
      expect(readFileSync(path.resolve(__dirname, '../../.jait/artifacts/messenger-download.txt'), 'utf8')).toBe('private attachment')
      // Manual marks sync to Matrix account data and survive a reload without opening the room.
      const conversation = page.getByRole('group', { name: 'Conversation Homelab messages', exact: true })
      await page.getByRole('main').getByRole('button', { name: 'Mark as unread', exact: true }).click()
      await expect(conversation.getByLabel('Unread', { exact: true })).toBeVisible()
      const unreadState = await request.get(server + '/_matrix/client/v3/user/' + encodeURIComponent(alice.userId) + '/rooms/' + encodeURIComponent(roomId) + '/account_data/m.marked_unread', { headers: alice.headers })
      expect((await unreadState.json()).unread).toBe(true)
      await page.reload()
      await expect(conversation.getByLabel('Unread', { exact: true })).toBeVisible({ timeout: 30_000 })
      await conversation.getByRole('button', { name: 'Mark as read', exact: true }).click()
      await expect(conversation.getByRole('button', { name: 'Mark as unread', exact: true })).toBeVisible()
      // The same action URL delivered by native and service-worker buttons works without opening a room.
      await conversation.getByRole('button', { name: 'Mark as unread', exact: true }).click()
      const beforeRead = await request.get(server + '/_matrix/client/v3/rooms/' + encodeURIComponent(roomId) + '/messages?dir=b&limit=20', { headers: alice.headers })
      const notifiedEvent = (await beforeRead.json()).chunk.find((event: { type: string }) => event.type === 'm.room.encrypted').event_id as string
      const actionLink = '/messenger?' + new URLSearchParams({ action: 'mark-read', roomId, eventId: notifiedEvent, account: alice.userId, homeserver: server })
      await page.evaluate(async ({ link, id }) => {
        const { openNotification } = await import('/src/lib/notification-navigation.ts')
        openNotification({ id, link })
      }, { link: actionLink, id: 'matrix:' + notifiedEvent })
      await expect(conversation.getByRole('button', { name: 'Mark as unread', exact: true })).toBeVisible({ timeout: 30_000 })
      await page.getByRole('button', { name: /Homelab messages/ }).click()
      await page.getByLabel('Filter by service').click()
      await page.getByRole('option', { name: 'WhatsApp', exact: true }).click()
      await expect(page.getByRole('button', { name: /Homelab messages/ })).toBeVisible()
      await page.getByLabel('Search conversations and messages').fill('missing')
      await expect(page.getByText('No matching conversations.')).toBeVisible()
      await page.getByLabel('Search conversations and messages').fill('')
      await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/messenger-encrypted-desktop.png') })
      await page.setViewportSize({ width: 390, height: 850 })
      await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/messenger-encrypted-mobile.png') })
      await page.reload()
      await expect(page.getByRole('status').filter({ hasText: 'Connected' })).toBeVisible({ timeout: 30_000 })
      await expect(page.getByRole('log', { name: 'Messages' }).getByText('Encrypted reply', { exact: true })).toBeVisible({ timeout: 30_000 })
      await page.getByRole('button', { name: 'Connections' }).click()
      await page.getByRole('button', { name: 'Disconnect', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Connect Matrix', exact: true })).toBeVisible()
      expect(gatewayRequests).toEqual([])
      expect(await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('jait.messenger.session.')))).toEqual([])
    } finally { await otherContext.close() }
  })
})
