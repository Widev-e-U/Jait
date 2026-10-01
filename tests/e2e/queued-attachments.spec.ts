import { expect, test } from '@playwright/test'

for (const width of [390, 1280]) {
  test(`attachment chips fit composer, queue and transcript at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => import('/src/e2e-fixtures/queued-attachments.tsx'))
    for (const surface of ['composer', 'queue', 'sent']) {
      const scope = page.getByTestId(surface)
      await expect(scope.getByRole('button', { name: 'Expand image photo.png' })).toBeVisible()
      await expect(scope.locator('[data-attachment-list]')).toHaveCount(1)
      await expect(scope.locator('[download]')).toHaveCount(1)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    const queue = page.getByTestId('queue')
    await queue.getByRole('button', { name: 'Edit message', exact: true }).click()
    await queue.locator('textarea').fill('Edited queue text')
    await expect(queue.locator('[data-attachment-list]')).toBeVisible()
    await queue.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(queue.getByText('Edited queue text', { exact: true })).toBeVisible()
    await queue.getByRole('button', { name: 'Expand image photo.png' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    await page.getByTestId('composer').getByRole('button', { name: 'Remove photo.png' }).click()
    await expect(page.getByTestId('composer').getByRole('button', { name: 'Expand image photo.png' })).toHaveCount(0)
    await expect(queue.getByRole('button', { name: 'Expand image photo.png' })).toBeVisible()
  })
}
