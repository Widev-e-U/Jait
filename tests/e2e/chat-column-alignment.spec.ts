import { expect, test, type Page } from '@playwright/test'
import path from 'node:path'

const MESSAGE_SELECTOR = '[data-testid="fixture-message-text"]'
const COMPOSER_EDITOR_SELECTOR = '[data-testid="chat-composer"] [contenteditable="true"]'

const viewports = [
  { name: 'wide', width: 1440, height: 1000 },
  { name: 'standard', width: 900, height: 900 },
  { name: 'mobile', width: 393, height: 851 },
]

async function openAlignmentFixture(page: Page) {
  await page.goto('/src/e2e-fixtures/index.html', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => import('/src/e2e-fixtures/chat-column-alignment.tsx'))
  await expect(page.getByTestId('fixture-message-text')).toBeVisible()
  const editor = page.locator(COMPOSER_EDITOR_SELECTOR)
  await expect(editor).toBeVisible()
  await editor.click()
  await editor.pressSequentially('Aligned prompt text')
  await expect(editor).toContainText('Aligned prompt text')
  return editor
}

/** Left edge of the painted glyphs, not of the padded box that holds them. */
async function glyphBox(page: Page, selector: string) {
  return page.evaluate(sel => {
    const node = document.querySelector(sel)
    if (!node) throw new Error(`missing ${sel}`)
    const range = document.createRange()
    range.selectNodeContents(node)
    const box = range.getBoundingClientRect()
    const fallback = node.getBoundingClientRect()
    return { left: box.width > 0 ? box.left : fallback.left, right: box.width > 0 ? box.right : fallback.right }
  }, selector)
}

for (const viewport of viewports) {
  test(`message text and composer text share one centered column at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await openAlignmentFixture(page)

    const message = await glyphBox(page, MESSAGE_SELECTOR)
    const composer = await glyphBox(page, COMPOSER_EDITOR_SELECTOR)
    console.log(`DELTA ${viewport.name}: ${(message.left - composer.left).toFixed(2)}px`)
    expect(Math.abs(message.left - composer.left)).toBeLessThanOrEqual(2)

    const transcript = await page.getByTestId('fixture-transcript-boundary').boundingBox()
    const input = await page.getByTestId('fixture-composer-boundary').boundingBox()
    expect(transcript).not.toBeNull()
    expect(input).not.toBeNull()
    // Both halves of the pane span the same width, so neither column is offset.
    expect(Math.abs(transcript!.width - input!.width)).toBeLessThanOrEqual(1)
    // And the column itself stays centered in the viewport.
    const leftGap = transcript!.x
    const rightGap = viewport.width - (transcript!.x + transcript!.width)
    expect(Math.abs(leftGap - rightGap)).toBeLessThanOrEqual(2)

    await page.screenshot({
      path: path.resolve(__dirname, `../../.jait/shots/chat-column-alignment-${viewport.name}.png`),
      fullPage: false,
    })
  })
}
