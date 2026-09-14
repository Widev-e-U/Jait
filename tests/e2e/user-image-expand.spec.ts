import path from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * Regression: the "Click to expand" button nested inside a user message bubble
 * must open the image lightbox only — it must never fall through to the bubble's
 * click-to-edit handler and open the message editor.
 *
 * The spec mounts the real `Message` component through a Vite fixture so the
 * whole app (and gateway) does not have to boot just to render one bubble.
 */
const fixtureUrl = '/@fs' + path.resolve(__dirname, 'fixtures/user-image-expand.html')

// The edit composer is a Lexical contenteditable (no <textarea>), so detect edit
// mode through the composer's cancel control.
const EDITING_MARKER = 'button[aria-label="Cancel editing message"]'

async function openFixture(page: import('@playwright/test').Page) {
  await page.goto(fixtureUrl, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('have a look at this')).toBeVisible()
}

test('expanding a user message image opens the lightbox and never the editor', async ({ page }) => {
  await openFixture(page)

  const imagePreview = page.getByRole('img', { name: 'photo.png' })
  await expect(imagePreview).toBeVisible()

  const expandButton = page.getByRole('button', { name: 'Expand image photo.png' })
  await expect(expandButton).toBeVisible()

  // The affordance the user reported: hovering the image reveals "Click to expand".
  await expandButton.hover()
  await expect(page.getByText('Click to expand')).toBeVisible()

  // Clicking the preview (not the text) must open the lightbox...
  await expandButton.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('img', { name: 'photo.png' })).toBeVisible()

  // ...and must NOT put the message into edit mode.
  await expect(page.locator(EDITING_MARKER)).toHaveCount(0)
})

test('clicking the bubble text still opens the message editor', async ({ page }) => {
  await openFixture(page)

  await page.getByText('have a look at this').click()
  const editor = page.locator(EDITING_MARKER)
  await expect(editor).toHaveCount(1)
  await expect(editor).toBeVisible()
})
