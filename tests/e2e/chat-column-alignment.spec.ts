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
    // Message text and typed prompt text share one left edge. The composer keeps
    // a 1px border the transcript has no counterpart for, hence the tolerance.
    expect(Math.abs(message.left - composer.left)).toBeLessThanOrEqual(2)

    const transcript = await page.getByTestId('fixture-transcript-boundary').boundingBox()
    const input = await page.getByTestId('fixture-composer-boundary').boundingBox()
    const column = await page.getByTestId('fixture-composer-column').boundingBox()
    expect(transcript).not.toBeNull()
    expect(input).not.toBeNull()
    expect(column).not.toBeNull()
    // Transcript and composer halves of the pane span the same width, so neither
    // column is inset relative to the other.
    expect(Math.abs(transcript!.width - input!.width)).toBeLessThanOrEqual(1)

    // The centered column: max-w-4xl (896px) capped by the viewport, as pinned
    // numerically in floating-indicator-layout.ts.
    const columnLeft = Math.max(0, (viewport.width - Math.min(896, viewport.width)) / 2)
    const columnWidth = Math.min(896, viewport.width)
    // The composer block spans the column edge (`px-0`) ...
    expect(Math.abs(input!.x - 0)).toBeLessThanOrEqual(1)
    // ... its content column is the centered max-w-4xl column ...
    expect(Math.abs(column!.x - columnLeft)).toBeLessThanOrEqual(1)
    expect(Math.abs(column!.width - columnWidth)).toBeLessThanOrEqual(1)
    // ... and the message text sits at the column edge plus its 16/20px gutter.
    const gutter = viewport.width >= 640 ? 20 : 16
    expect(Math.abs(message.left - (columnLeft + gutter))).toBeLessThanOrEqual(1)

    await page.screenshot({
      path: path.resolve(__dirname, `../../.jait/shots/chat-column-alignment-${viewport.name}.png`),
      fullPage: false,
    })
  })
}
