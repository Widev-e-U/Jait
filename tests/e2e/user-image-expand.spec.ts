import { expect, test } from '@playwright/test'

/**
 * Regression: the "Click to expand" button nested inside a user message bubble
 * must open the image lightbox only — it must never fall through to the bubble's
 * click-to-edit handler and open the message editor.
 */
const EDITING_MARKER = 'button[aria-label="Cancel editing message"]'

async function openFixture(page: import('@playwright/test').Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => import('/src/e2e-fixtures/user-image-expand.tsx'))
  await expect(page.getByText('have a look at this')).toBeVisible()
}

test('expanding a user message image opens the lightbox and never the editor', async ({ page }) => {
  await openFixture(page)

  const imagePreview = page.getByRole('img', { name: 'photo.png' })
  await expect(imagePreview).toBeVisible()

  const expandButton = page.getByRole('button', { name: 'Expand image photo.png' })
  await expect(expandButton).toBeVisible()

  await expandButton.hover()
  await expect(page.getByText('Click to expand')).toBeVisible()

  await expandButton.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('img', { name: 'photo.png' })).toBeVisible()
  await expect(page.locator(EDITING_MARKER)).toHaveCount(0)
})

test('clicking the bubble text still opens the message editor', async ({ page }) => {
  await openFixture(page)

  await page.getByText('have a look at this').click()
  const editor = page.locator(EDITING_MARKER)
  await expect(editor).toHaveCount(1)
  await expect(editor).toBeVisible()
})
