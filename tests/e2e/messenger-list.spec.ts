import path from 'node:path'
import { expectBadgeInkCentered } from './badge-ink'
import { expect, test, type Page } from '@playwright/test'

// Keep output in the project's review folders.
test.use({ screenshot: 'off' })
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZksAAAAASUVORK5CYII='

async function mount(page: Page) {
  const state = { user: '@alice:test', avatar: 'mxc://test/avatar-v1', unread: 2, requests: [] as string[] }
  await page.route('**/api/messenger**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/command')) return route.fulfill({ json: { ok: true } })
    if (url.pathname.endsWith('/media')) {
      state.requests.push(route.request().postDataJSON().url)
      return route.fulfill({ json: { data: png } })
    }
    return route.fulfill({ json: { snapshot: {
      status: 'ready', error: null, notifications: false, assistantAccess: false, hasEarlier: false,
      session: { homeserver: 'https://matrix.test', userId: state.user, deviceId: 'A' },
      selectedRoomId: url.searchParams.get('roomId'), messages: [],
      rooms: [
        { id: '!alice:test', name: 'Alice', service: 'WhatsApp', network: 'Personal', membership: 'join', encrypted: true, unread: state.unread, timestamp: 2, preview: 'Firewall ready', avatarUrl: state.avatar },
        { id: '!bob:test', name: 'Bob', service: 'Teams', network: 'Work', membership: 'join', encrypted: true, unread: 0, timestamp: 1, preview: 'See you tomorrow', peer: { userId: '@bob:test', name: 'Bob', avatarUrl: state.avatar } },
      ],
    } } })
  })
  await page.goto('/src/e2e-fixtures/messenger-gateway.html?roomId=%21alice%3Atest')
  return state
}

async function expectAvatars(page: Page) {
  const avatars = page.getByRole('complementary', { name: 'Conversations' }).locator('img')
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
    expect(bounds!.height).toBeLessThanOrEqual(52)
    const name = await row.getByText('Alice', { exact: true }).boundingBox()
    const service = await row.getByText('WhatsApp · Personal', { exact: true }).boundingBox()
    expect(service!.x).toBeGreaterThan(name!.x + name!.width)
    expect(Math.abs(service!.y + service!.height / 2 - name!.y - name!.height / 2)).toBeLessThan(1)
    const unreadBadge = row.getByLabel('2 unread messages', { exact: true })
    await expect(unreadBadge).toHaveCSS('text-align', 'center')
    const unread = await unreadBadge.boundingBox()
    await expectBadgeInkCentered(unreadBadge, 'count', 'unread-' + width)
    expect(unread!.width).toBe(unread!.height)
    expect(Math.abs(unread!.y + unread!.height / 2 - bounds!.y - bounds!.height / 2)).toBeLessThan(1)
    await expect(row).toContainText('Firewall ready')
    await expect(row).toContainText('WhatsApp')
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

test('large unread counts keep a centered circular badge', async ({ page }) => {
  const state = await mount(page)
  state.unread = 123
  await page.reload()
  const badge = page.getByRole('group', { name: 'Conversation Alice' }).getByLabel('123 unread messages', { exact: true })
  await expect(badge).toHaveText('99+')
  const bounds = await badge.boundingBox()
  expect(bounds!.width).toBe(bounds!.height)
})
