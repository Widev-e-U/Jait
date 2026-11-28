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

    const rail = page.getByRole('navigation', { name: 'Jump to user message' })
    if (viewport.width >= 944) await expect(rail).toBeVisible()
    else await expect(rail).toBeHidden()

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


test('scroll to latest remains clickable beside the message rail', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/src/e2e-fixtures/index.html?long', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => import('/src/e2e-fixtures/chat-column-alignment.tsx'))
  const rail = page.getByRole('navigation', { name: 'Jump to user message' })
  await expect(rail).toBeVisible()
  const scroller = page.locator('.chat-conversation-viewport .overflow-y-auto').first()
  await expect(scroller).toBeVisible()
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await scroller.hover()
  await page.mouse.wheel(0, -2000)
  const button = page.getByRole('button', { name: 'Scroll to latest message' })
  await expect(button).toBeVisible()
  const buttonBox = await button.boundingBox()
  const railBox = await rail.boundingBox()
  expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(railBox!.x)
  await button.click()
  await expect(button).toBeHidden()
})

test('message rail previews user prompts and jumps across virtualized history', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 820 })
  await page.goto('/src/e2e-fixtures/index.html?long', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => import('/src/e2e-fixtures/chat-column-alignment.tsx'))

  const rail = page.getByRole('navigation', { name: 'Jump to user message' })
  const ticks = rail.getByRole('button')
  await expect(ticks).toHaveCount(7)
  const target = ticks.nth(1)
  const userMessage = page.locator('[data-conversation-scroll]').getByText(/^Prompt 2:/)
  await expect(userMessage).toHaveCount(0)
  const tickWidths = () => ticks.locator('span').evaluateAll(lines =>
    lines.map(line => getComputedStyle(line).width),
  )
  const restingWidth = '12px'
  const outerWidth = '18px'
  const innerWidth = '24px'
  const activeWidth = '30px'
  const restingWidths = Array(7).fill(restingWidth)
  await expect.poll(tickWidths).toEqual(restingWidths)

  await ticks.nth(3).hover()
  await expect.poll(tickWidths).toEqual([
    restingWidth, outerWidth, innerWidth, activeWidth, innerWidth, outerWidth, restingWidth,
  ])
  await expect(page.locator('[data-slot="tooltip-content"] > span').first()).toHaveText(/^Prompt 4:/)
  await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/chat-message-rail-wave.png') })

  await target.hover()
  await expect.poll(tickWidths).toEqual([
    innerWidth, activeWidth, innerWidth, outerWidth, restingWidth, restingWidth, restingWidth,
  ])
  const preview = page.locator('[data-slot="tooltip-content"] > span').first()
  await expect(preview).toHaveText(/^Prompt 2:/)
  await expect(preview).toHaveCSS('text-overflow', 'ellipsis')
  expect(await preview.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
  await page.mouse.move(10, 10)
  await expect.poll(tickWidths).toEqual(restingWidths)

  await target.click()
  await expect(userMessage).toBeInViewport({ ratio: 1 })
  await page.mouse.move(10, 10)
  await ticks.last().press('Tab')
  await ticks.last().focus()
  await expect.poll(tickWidths).toEqual([
    restingWidth, restingWidth, restingWidth, restingWidth, outerWidth, innerWidth, activeWidth,
  ])
  await ticks.last().press('Enter')
  await expect(page.locator('[data-conversation-scroll]').getByText('A right aligned user message')).toBeInViewport()
})

test('streamed wide Markdown stays within the mobile chat column', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 851 })
  await page.goto('/src/e2e-fixtures/index.html?overflow', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => import('/src/e2e-fixtures/chat-column-alignment.tsx'))
  await page.getByRole('button', { name: 'Stream wide content' }).click()
  const content = page.locator('[data-message-from="assistant"] [data-message-from="assistant"]').first()
  await expect(content.locator('table')).toBeVisible()
  const column = page.getByTestId('fixture-composer-column')
  const columnBox = (await column.boundingBox())!
  const contentBox = (await content.boundingBox())!
  expect(contentBox.x + contentBox.width).toBeLessThanOrEqual(columnBox.x + columnBox.width + 1)
  const transcript = page.locator('.chat-conversation-viewport .overflow-y-auto').first()
  await expect.poll(() => transcript.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
  await expect.poll(() => content.evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return Array.from(element.querySelectorAll('*')).filter((child) => {
      const rect = child.getBoundingClientRect()
      // Children inside a horizontal scroll area may extend beyond its bounds.
      const scroller = child.closest('.overflow-x-auto')
      return !scroller && (rect.right > bounds.right + 1 || rect.left < bounds.left - 1)
    }).map((child) => child.tagName + ':' + child.className)
  })).toEqual([])
  const tableScroller = content.locator('table').locator('..')
  await expect.poll(() => tableScroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
  const codeScroller = content.locator('code.whitespace-pre').locator('..')
  await expect.poll(() => codeScroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
})


test('reloaded assistant message actions stay visible inside the mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 851 })
  await page.goto('/src/e2e-fixtures/index.html?reloaded', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => import('/src/e2e-fixtures/chat-column-alignment.tsx'))
  const actions = page.getByRole('button', { name: 'Message actions' }).first()
  await expect(actions).toBeVisible()
  const bounds = (await actions.boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(393)
  await actions.click()
  await expect(page.getByRole('menuitem', { name: 'Copy message' })).toBeVisible()
})
