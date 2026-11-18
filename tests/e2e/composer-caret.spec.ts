import { expect, test, type Page } from '@playwright/test'

async function openComposer(page: Page, variant: 'assistant' | 'messenger') {
  await page.goto(`/src/e2e-fixtures/index.html?${variant}`)
  await page.evaluate(() => import('/src/e2e-fixtures/chat-column-alignment.tsx'))
  const editor = page.getByRole('textbox', { name: 'Message', exact: true })
  await editor.fill('first line')
  await editor.press('End')
  return editor
}

for (const variant of ['assistant', 'messenger'] as const) {
  test(`paste stays on the current line in ${variant}`, async ({ page }) => {
    const editor = await openComposer(page, variant)
    await editor.press('Shift+Enter')
    await editor.evaluate(element => {
      const data = new DataTransfer()
      data.setData('text/plain', 'pasted')
      element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }))
    })
    await page.keyboard.insertText('!')
    await expect.poll(async () => (await editor.innerText()).trimEnd()).toBe('first line\npasted!')
  })

  test(`keyboard emoji stays on the current line in ${variant}`, async ({ page }) => {
    const editor = await openComposer(page, variant)
    await editor.press('Shift+Enter')
    await page.keyboard.insertText('👍')
    await page.keyboard.insertText('!')
    await expect.poll(async () => (await editor.innerText()).trimEnd()).toBe('first line\n👍!')
  })
}

test('the Messenger emoji picker replaces the selected text and returns the caret', async ({ page }) => {
  const editor = await openComposer(page, 'messenger')
  await editor.press('Home')
  for (let index = 0; index < 'first'.length; index++) await editor.press('Shift+ArrowRight')
  await page.getByRole('button', { name: 'Emoji', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Search emoji' })).toBeFocused()
  await page.getByRole('button', { name: 'Insert 👍', exact: true }).click()
  await expect(editor).toBeFocused()
  await page.keyboard.insertText('!')
  await expect(editor).toHaveText('👍! line')
})
