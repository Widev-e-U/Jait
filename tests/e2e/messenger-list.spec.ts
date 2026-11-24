import path from 'node:path'
import { expectBadgeInkCentered } from './badge-ink'
import { expect, test, type Page } from '@playwright/test'

// Keep output in the project's review folders.
test.use({ screenshot: 'off' })
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZksAAAAASUVORK5CYII='

async function mount(page: Page, presence = false, typing = false) {
  const state = { user: '@alice:test', avatar: 'mxc://test/avatar-v1', unread: 2, teamsInvite: false, hidden: new Set<string>(), commands: [] as any[], requests: [] as string[] }
  await page.route('**/api/messenger**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/command')) {
      const command = route.request().postDataJSON()
      state.commands.push(command)
      // The gateway stores hidden state in account data, so the next snapshot reports it.
      if (command.action === 'hide') state.hidden.add(command.roomId)
      if (command.action === 'unhide') state.hidden.delete(command.roomId)
      return route.fulfill({ json: { ok: true } })
    }
    if (url.pathname.endsWith('/media')) {
      state.requests.push(route.request().postDataJSON().url)
      return route.fulfill({ json: { data: png } })
    }
    const roomId = url.searchParams.get('roomId')
    return route.fulfill({ json: { snapshot: {
      status: 'ready', error: null, notifications: false, assistantAccess: false, hasEarlier: false,
      session: { homeserver: 'https://matrix.test', userId: state.user, deviceId: 'A' },
      selectedRoomId: roomId, typing: roomId === '!alice:test' ? ['Bob'] : [],
      messages: presence && roomId === '!group:test' ? [
        { id: '$one', sender: 'Bob', senderId: '@bob:test', senderPresence: 'offline', body: 'Checking in', timestamp: 1 },
        { id: '$two', sender: 'Carol', senderId: '@carol:test', body: 'Hello', timestamp: 2 },
      ].map(message => ({ own: false, encrypted: false, unableToDecrypt: false, pending: false, failed: false, ...message })) : [],
      rooms: [
        { id: '!alice:test', name: 'Alice', service: 'WhatsApp', network: 'Personal', membership: 'join', encrypted: true, unread: state.unread, timestamp: 2, preview: 'Firewall ready', avatarUrl: state.avatar, hidden: state.hidden.has('!alice:test'), ...(typing ? { typing: ['Bob'] } : {}), ...(presence ? { peer: { userId: '@alice-other:test', name: 'Alice', presence: 'unavailable' } } : {}) },
        { id: '!bob:test', name: 'Bob', service: 'Teams', network: 'Work', membership: state.teamsInvite ? 'invite' : 'join', encrypted: true, unread: 0, timestamp: 1, preview: 'See you tomorrow', hidden: state.hidden.has('!bob:test'), peer: { userId: '@bob:test', name: 'Bob', avatarUrl: state.avatar, ...(presence ? { presence: 'offline' } : {}) } },
        ...(presence ? [{ id: '!group:test', name: 'Project group', service: 'Teams', network: 'Work', membership: 'join', encrypted: true, unread: 0, timestamp: 3, preview: 'Hello' }] : []),
      ],
    } } })
  })
  await page.goto('/src/e2e-fixtures/messenger-gateway.html?roomId=%21alice%3Atest')
  return state
}

async function expectAvatars(page: Page) {
  // Avatars are decorative (alt=""); provider logos in the header and rows are named after their service.
  const avatars = page.getByRole('complementary', { name: 'Conversations' }).locator('img[alt=""]')
  await expect(avatars).toHaveCount(2)
  await expect.poll(() => avatars.evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true)
}

for (const width of [390, 1280]) {
  test(`chat list caches avatars across reloads and stays compact at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const state = await mount(page)
    // Open the list on small screens.
    if (width < 768) await page.getByRole('button', { name: 'Back to conversations' }).click()
    await expectAvatars(page)
    expect(state.requests).toEqual(['mxc://test/avatar-v1'])
    const row = page.getByRole('group', { name: 'Conversation Alice' })
    const bounds = await row.boundingBox()
    expect(bounds!.height).toBeGreaterThanOrEqual(44)
    // 44px avatar + 20px row padding + 1px divider.
    expect(bounds!.height).toBeLessThanOrEqual(66)
    const name = await row.getByText('Alice', { exact: true }).boundingBox()
    // Rows show the provider logo (its alt text is the service name), not a text label.
    const service = await row.getByRole('img', { name: 'WhatsApp', exact: true }).boundingBox()
    expect(service!.x).toBeGreaterThan(name!.x + name!.width)
    expect(Math.abs(service!.y + service!.height / 2 - name!.y - name!.height / 2)).toBeLessThan(1)
    const unreadBadge = row.getByLabel('2 unread messages', { exact: true })
    await expect(unreadBadge).toHaveCSS('text-align', 'center')
    const unread = await unreadBadge.boundingBox()
    await expectBadgeInkCentered(unreadBadge, 'count', 'unread-' + width)
    expect(unread!.width).toBe(unread!.height)
    expect(Math.abs(unread!.y + unread!.height / 2 - bounds!.y - bounds!.height / 2)).toBeLessThan(1)
    await expect(row).toContainText('Firewall ready')
    await expect(row.getByRole('img', { name: 'WhatsApp', exact: true })).toBeVisible()
    await page.reload()
    await expectAvatars(page)
    expect(state.requests).toEqual(['mxc://test/avatar-v1'])
    await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/messenger-compact-list-' + width + '.png') })
  })
}

test('avatar cache separates Matrix accounts and picks up new picture URLs', async ({ page }) => {
  const state = await mount(page)
  await expectAvatars(page)
  state.user = '@other:test'
  await page.reload()
  await expectAvatars(page)
  expect(state.requests).toEqual(['mxc://test/avatar-v1', 'mxc://test/avatar-v1'])
  state.avatar = 'mxc://test/avatar-v2'
  await page.reload()
  await expectAvatars(page)
  expect(state.requests.at(-1)).toBe('mxc://test/avatar-v2')
  expect(state.requests).toHaveLength(3)
})

test('avatars still load when browser cache storage is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'caches', { get() { throw new Error('Cache storage disabled') } })
  })
  const state = await mount(page)
  await expectAvatars(page)
  expect(state.requests).toHaveLength(1)
})


test('the conversation and three-dot menu share one hover and selected background', async ({ page }) => {
  await mount(page)
  const selected = page.getByRole('group', { name: 'Conversation Alice', includeHidden: true })
  const hovered = page.getByRole('group', { name: 'Conversation Bob', includeHidden: true })
  const hasUniformBackground = (row: typeof selected) => row.evaluate(element => {
    const background = getComputedStyle(element).backgroundColor
    const effectiveBackground = (button: Element) => {
      let current: Element | null = button
      while (current) {
        const color = getComputedStyle(current).backgroundColor
        if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') return color
        current = current.parentElement
      }
      return 'transparent'
    }
    return background !== 'rgba(0, 0, 0, 0)' && [...element.querySelectorAll('button')].every(button => effectiveBackground(button) === background)
  })
  await page.mouse.move(1, 1)
  await expect.poll(() => hasUniformBackground(selected)).toBe(true)
  await hovered.getByRole('button').first().hover()
  await expect.poll(() => hasUniformBackground(hovered)).toBe(true)
  const menu = hovered.getByRole('button', { name: 'Options for Bob', includeHidden: true })
  await menu.hover()
  await expect.poll(() => hasUniformBackground(hovered)).toBe(true)
  const panel = await page.getByRole('complementary', { name: 'Conversations' }).boundingBox()
  await page.screenshot({
    path: path.resolve(__dirname, '../../.jait/shots/messenger-shared-row-background.png'),
    clip: { ...panel!, height: Math.min(panel!.height, 200) },
  })
  await menu.click()
  await expect(page.getByRole('menu')).toBeVisible()
  await page.mouse.move(1, 1)
  await expect(menu).toHaveAttribute('data-state', 'open')
  await expect.poll(() => hasUniformBackground(hovered)).toBe(true)
  await expect.poll(() => hasUniformBackground(selected)).toBe(true)
})

test('large unread counts keep a centered pill badge', async ({ page }) => {
  const state = await mount(page)
  state.unread = 123
  await page.reload()
  const badge = page.getByRole('group', { name: 'Conversation Alice' }).getByLabel('123 unread messages', { exact: true })
  await expect(badge).toHaveText('99+')
  const bounds = await badge.boundingBox()
  // Three characters widen the single-digit circle into a pill: fully rounded, wider than tall, ink still centered.
  await expect(badge).toHaveCSS('border-top-left-radius', '9999px')
  expect(bounds!.width).toBeGreaterThan(bounds!.height)
  await expectBadgeInkCentered(badge, 'count', 'unread-99')
})

test('hidden chats stay out of the inbox and can be restored', async ({ page }) => {
  await mount(page)
  await page.getByRole('button', { name: 'Options for Alice' }).click()
  await page.getByRole('menuitem', { name: 'Hide chat' }).click()
  await expect(page.getByRole('group', { name: 'Conversation Alice' })).toHaveCount(0)
  await page.reload()
  await page.getByRole('button', { name: 'More filters' }).click()
  await page.getByRole('menuitem', { name: /^Hidden/ }).click()
  await expect(page.getByRole('group', { name: 'Conversation Alice' })).toBeVisible()
  await page.getByRole('button', { name: 'Options for Alice' }).click()
  await page.getByRole('menuitem', { name: 'Unhide chat' }).click()
  await expect(page.getByRole('group', { name: 'Conversation Alice' })).toHaveCount(0)
  await page.getByRole('button', { name: /^Hidden/ }).click()
  await expect(page.getByRole('group', { name: 'Conversation Alice' })).toBeVisible()
})

test('opening a recognized Teams invitation joins it', async ({ page }) => {
  const state = await mount(page)
  state.teamsInvite = true
  await page.reload()
  await page.getByRole('group', { name: 'Conversation Bob' }).getByRole('button').first().click()
  await expect.poll(() => state.commands.some(command => command.action === 'join' || command.type === 'join' || command.command === 'join')).toBe(true)
})

test('provider icons open settings while provider chips filter conversations', async ({ page }) => {
  await mount(page)
  const filters = page.getByRole('group', { name: 'Filter conversations' })
  const settings = page.getByRole('group', { name: 'Provider settings' })
  await settings.getByRole('button', { name: /WhatsApp:/ }).click()
  await expect(page.getByRole('group', { name: 'Conversation Alice' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Conversation Bob' })).toBeVisible()
  await expect(page.getByText('My status', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await filters.getByRole('button', { name: 'Teams', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Conversation Alice' })).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Conversation Bob' })).toBeVisible()
  await expect(filters.getByRole('button', { name: 'Teams', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await settings.getByRole('button', { name: /WhatsApp:/ }).click()
  await expect(page.getByRole('group', { name: 'Conversation Alice' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await filters.getByRole('button', { name: 'Teams', exact: true }).click()
  await expect(page.getByRole('group', { name: 'Conversation Alice' })).toBeVisible()
})

test('typing indicator follows the room and drafts survive switching', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 })
  await mount(page, false, true)
  const alice = page.getByRole('group', { name: 'Conversation Alice' })
  const listTyping = alice.getByRole('status')
  const composer = page.locator('[data-messenger-composer]')
  const chatTyping = composer.getByRole('status').filter({ hasText: 'Bob is typing' })
  const editor = composer.locator('[contenteditable="true"]')

  for (const indicator of [listTyping, chatTyping]) {
    await expect(indicator).toHaveText('Bob is typing')
    await expect(indicator).toBeVisible()
    const dots = indicator.locator('[aria-hidden="true"] > span')
    await expect(dots).toHaveCount(3)
    for (const [index, delay] of ['0s', '0.12s', '0.24s'].entries()) {
      await expect(dots.nth(index)).toHaveCSS('animation-name', 'bounce')
      await expect(dots.nth(index)).toHaveCSS('animation-delay', delay)
    }
  }
  const typingBounds = (await chatTyping.boundingBox())!
  const composerBounds = (await composer.boundingBox())!
  const editorBounds = (await editor.boundingBox())!
  expect(typingBounds.x).toBeCloseTo(composerBounds.x, 0)
  expect(typingBounds.y + typingBounds.height).toBeLessThan(editorBounds.y)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(listTyping.locator('[aria-hidden="true"] > span').first()).toHaveCSS('animation-name', 'none')
  await expect(chatTyping.locator('[aria-hidden="true"] > span').first()).toHaveCSS('animation-name', 'none')

  await editor.fill('Draft for Alice')
  await page.getByRole('group', { name: 'Conversation Bob' }).click()
  await expect(chatTyping).toHaveCount(0)
  await expect(listTyping).toBeVisible()
  await editor.fill('Draft for Bob')
  await alice.click()
  await expect(editor).toHaveText('Draft for Alice')
  await expect(chatTyping).toBeVisible()
})

test('shows provider presence on direct contacts and on individual group sender avatars', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await mount(page, true)
  const conversations = page.getByRole('complementary', { name: 'Conversations' })
  await expect(conversations.getByRole('group', { name: 'Conversation Alice' }).locator('[data-presence-dot="unavailable"]')).toBeVisible()
  await expect(conversations.getByRole('group', { name: 'Conversation Bob' }).locator('[data-presence-dot="offline"]')).toBeVisible()
  const group = conversations.getByRole('group', { name: 'Conversation Project group' })
  await expect(group.locator('[data-presence-dot]')).toHaveCount(0)
  await group.getByRole('button', { name: /^Project group/ }).click()
  await expect(page.locator('[data-message-id="$one"] [data-presence-dot="offline"]')).toBeVisible()
  await expect(page.locator('[data-message-id="$two"]')).toBeVisible()
  await expect(page.locator('[data-message-id="$two"] [data-presence-dot]')).toHaveCount(0)
})
