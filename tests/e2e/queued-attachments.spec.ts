import { expect, test } from '@playwright/test'

for (const width of [390, 1280]) {
  test(`attachment chips fit composer, queue and transcript at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/src/e2e-fixtures/index.html', { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => import('/src/e2e-fixtures/queued-attachments.tsx'))
    for (const surface of ['composer', 'queue', 'sent']) {
      const scope = page.getByTestId(surface)
      if (surface === 'composer') await expect(scope.getByRole('textbox').getByRole('img', { name: 'photo.png' })).toBeVisible()
      else await expect(scope.getByRole('button', { name: surface === 'sent' ? 'View image 1: photo.png' : 'Expand image photo.png' })).toBeVisible()
      await expect(scope.locator('[data-attachment-list]')).toHaveCount(1)
      await expect(scope.locator('[download]')).toHaveCount(1)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    const queue = page.getByTestId('queue')
    await queue.getByRole('button', { name: 'Edit message', exact: true }).click()
    const editing = page.locator('[data-queue-editor]')
    const editor = editing.locator('[contenteditable="true"]')
    await editor.evaluate(element => {
      const text = Array.from(element.childNodes).find(node => node.nodeType === Node.TEXT_NODE)!
      const range = document.createRange()
      range.selectNodeContents(text)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      ;(element as HTMLElement).focus()
    })
    await page.keyboard.type('Edited queue text')
    await expect(editing.locator('[data-attachment-list]')).toBeVisible()
    await editing.getByRole('button', { name: 'Save changes', exact: true }).click()
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
