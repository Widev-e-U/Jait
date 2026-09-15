import { expect, test } from '@playwright/test'

test('Q&A links open independently of answer selection on desktop and mobile', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => import('/src/e2e-fixtures/question-links.tsx'))

  const details = page.getByRole('link', { name: 'Details' })
  await expect(details).toHaveAttribute('href', 'https://example.com/details')
  const popupPromise = page.waitForEvent('popup')
  await details.click()
  const popup = await popupPromise
  await popup.close()
  await expect(page.getByRole('radio')).not.toBeChecked()
  await page.getByText('First', { exact: true }).click()
  await expect(page.getByRole('radio')).toBeChecked()
  await expect(page.getByRole('button', { name: 'Submit' })).toBeEnabled()
})
