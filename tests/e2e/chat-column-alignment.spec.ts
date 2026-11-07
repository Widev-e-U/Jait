import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'

const MESSAGE_SELECTOR = '[data-message-from="assistant"]'
const USER_BUBBLE_SELECTOR = '[data-message-from="user"] [data-message-from="user"]'
const COMPOSER_EDITOR_SELECTOR = '[data-testid="chat-composer"] [contenteditable="true"]'

const viewports = [
  { name: 'wide', width: 1440, height: 1000 },
  { name: 'standard', width: 900, height: 900 },
  { name: 'gutter', width: 1200, height: 900 },
  { name: 'mobile', width: 393, height: 851 },
]

async function openAlignmentFixture(page: Page) {
  await page.goto('/src/e2e-fixtures/index.html', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => import('/src/e2e-fixtures/chat-column-alignment.tsx'))
  await expect(page.locator(MESSAGE_SELECTOR).first()).toBeVisible()
  const editor = page.locator(COMPOSER_EDITOR_SELECTOR)
  await expect(editor).toBeVisible()
  await editor.click()
  await editor.pressSequentially('Aligned prompt text')
  await expect(editor).toContainText('Aligned prompt text')
  return editor
}

for (const viewport of viewports) {
  test(`message edges align with the composer at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await openAlignmentFixture(page)

    const minimap = page.getByRole('slider', { name: 'Conversation minimap' })
    if (viewport.width >= 1088) await expect(minimap).toBeVisible()
    else await expect(minimap).toBeHidden()

    const assistant = await page.locator(MESSAGE_SELECTOR).first().boundingBox()
    const assistantContent = await page.locator('[data-message-from="assistant"] [data-message-from="assistant"]').boundingBox()
    const userBubble = await page.locator(USER_BUBBLE_SELECTOR).boundingBox()
    const column = await page.getByTestId('fixture-composer-column').boundingBox()
    expect(assistant).not.toBeNull()
    expect(assistantContent).not.toBeNull()
    expect(userBubble).not.toBeNull()
    expect(column).not.toBeNull()
    expect(Math.abs(assistant!.x - column!.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(userBubble!.x + userBubble!.width - column!.x - column!.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(assistant!.x + assistant!.width - column!.x - column!.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(assistantContent!.x + assistantContent!.width - column!.x - column!.width)).toBeLessThanOrEqual(1)

    await page.screenshot({
      path: path.resolve(__dirname, `../../.jait/shots/chat-column-alignment-${viewport.name}.png`),
      fullPage: false,
    })
  })
}


test('scroll to latest remains clickable beside the minimap', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/src/e2e-fixtures/index.html?long', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => import('/src/e2e-fixtures/chat-column-alignment.tsx'))
  const minimap = page.getByRole('slider', { name: 'Conversation minimap' })
  await expect(minimap).toBeVisible()
  const scroller = page.locator('.chat-conversation-viewport .overflow-y-auto').first()
  await expect(scroller).toBeVisible()
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await scroller.hover()
  await page.mouse.wheel(0, -2000)
  const button = page.getByRole('button', { name: 'Scroll to latest message' })
  await expect(button).toBeVisible()
  const buttonBox = await button.boundingBox()
  const minimapBox = await minimap.boundingBox()
  expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(minimapBox!.x)
  await button.click()
  await expect(button).toBeHidden()
})
