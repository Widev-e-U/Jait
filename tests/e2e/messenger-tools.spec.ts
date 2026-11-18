import path from 'node:path'
import { expect, test } from '@playwright/test'

test.use({ screenshot: 'off' })
test('Matrix search links restore room, service, and query, and preserve parameters', async ({ page }) => {
  await page.goto('/src/e2e-fixtures/messenger-tools.html?q=firewall&service=WhatsApp&roomId=%21lab%3Atest', { waitUntil: 'domcontentloaded' })
  const searchBox = page.getByLabel('Search conversations and messages')
  const serviceFilter = page.getByLabel('Filter by service')
  await expect(searchBox).toHaveValue('firewall')
  await expect(serviceFilter).toHaveText('WhatsApp')
  await expect(page.getByRole('log', { name: 'Messages' })).toContainText('Firewall ready')
  await expect(page.getByRole('log', { name: 'Messages' })).not.toContainText('Hello')
  await searchBox.fill('missing')
  await expect(page).toHaveURL(/q=missing/)
  const params = new URL(page.url()).searchParams
  expect(params.get('service')).toBe('WhatsApp')
  expect(params.get('roomId')).toBe('!lab:test')
  await page.evaluate(() => {
    window.history.pushState(null, '', '/messenger?q=Team&service=Telegram')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(searchBox).toHaveValue('Team')
  await expect(serviceFilter).toHaveText('Telegram')
  await expect(page.getByRole('button', { name: /Team Telegram/ })).toBeVisible()
  // The same field also drives loaded-message results; they follow the service filter.
  await serviceFilter.click()
  await page.getByRole('option', { name: 'All', exact: true }).click()
  await expect(serviceFilter).toHaveText('All')
  await searchBox.fill('Hello')
  await expect(page.getByLabel('Message search results')).toContainText('Hello')
  // The service select is a listbox trigger, not a native select.
  await searchBox.fill('')
  await serviceFilter.click()
  await page.getByRole('option', { name: 'WhatsApp', exact: true }).click()
  await expect(serviceFilter).toHaveText('WhatsApp')
  await expect(page.getByRole('group', { name: 'Conversation Homelab' })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Conversation Team' })).toHaveCount(0)
  expect(new URL(page.url()).searchParams.get('service')).toBe('WhatsApp')
})

test('Legacy messageQ links still restore the search field', async ({ page }) => {
  await page.goto('/src/e2e-fixtures/messenger-tools.html?messageQ=firewall&roomId=%21lab%3Atest', { waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel('Search conversations and messages')).toHaveValue('firewall')
  await expect(page.getByRole('log', { name: 'Messages' })).toContainText('Firewall ready')
})

test('Conversations header keeps search and service filter on one row', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 })
  await page.goto('/src/e2e-fixtures/messenger-tools.html', { waitUntil: 'domcontentloaded' })
  const searchBox = page.getByLabel('Search conversations and messages')
  const serviceFilter = page.getByLabel('Filter by service')
  const search = await searchBox.boundingBox()
  const filter = await serviceFilter.boundingBox()
  expect(search).not.toBeNull()
  expect(filter).not.toBeNull()
  // Same row: vertical centers align and the filter sits to the right of the field.
  expect(Math.abs((search!.y + search!.height / 2) - (filter!.y + filter!.height / 2))).toBeLessThan(4)
  expect(filter!.x).toBeGreaterThan(search!.x + search!.width - 1)
  await expect(page.getByRole('textbox', { name: 'Search loaded messages' })).toHaveCount(0)
})

for (const width of [1280, 390]) {
  test('Matrix assistant access control at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/src/e2e-fixtures/messenger-tools.html', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Connections', exact: true }).click()
    const access = page.getByLabel('Allow assistant access', { exact: true })
    await expect(access).not.toBeChecked()
    await expect(page.getByText('Requested message text is shared', { exact: false })).toBeVisible()
    await access.check()
    await expect(access).toBeChecked()
    await access.uncheck()
    await expect(access).not.toBeChecked()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/messenger-tools-' + width + '.png') })
  })
}


test('browser back returns from a conversation to the chat list', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/src/e2e-fixtures/messenger-tools.html?q=Homelab', { waitUntil: 'domcontentloaded' })
  await page.getByRole('group', { name: 'Conversation Homelab' }).getByRole('button').first().click()
  await expect(page.getByRole('log', { name: 'Messages' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('complementary', { name: 'Conversations', exact: true })).toBeVisible()
  await expect(page).not.toHaveURL(/roomId=/)
  await expect(page.getByLabel('Search conversations and messages')).toHaveValue('Homelab')
  await page.goForward()
  await expect(page.getByRole('log', { name: 'Messages' })).toBeVisible()
})

test('browser back returns direct conversation links to the chat list', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/src/e2e-fixtures/messenger-tools.html?roomId=%21lab%3Atest', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('log', { name: 'Messages' })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('complementary', { name: 'Conversations', exact: true })).toBeVisible()
  await expect(page).not.toHaveURL(/roomId=/)
})
