import { expect, test, type Page } from '@playwright/test'

const chatId = '019f3850-ba91-782c-b71a-08516657e14c'
const otherId = '019f3850-ba91-782c-b71a-08516657e14d'

async function paste(page: Page, value: string) {
  await page.locator('[contenteditable="true"]').evaluate((editor, text) => {
    const data = new DataTransfer()
    data.setData('text/plain', text)
    editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }))
  }, value)
}

test('pasted chat IDs become references while unknown IDs remain text', async ({ page }) => {
  await page.route('**/api/sessions/*', async route => {
    const id = new URL(route.request().url()).pathname.split('/').pop()
    await route.fulfill(id === chatId
      ? { json: { id: chatId, title: 'Past conversation' } }
      : { status: 404, json: { error: 'NOT_FOUND' } })
  })
  await page.goto('/src/e2e-fixtures/index.html')
  await page.evaluate(() => import('/src/e2e-fixtures/chat-column-alignment.tsx'))
  const editor = page.locator('[contenteditable="true"]')
  await editor.click()
  await paste(page, chatId)
  await expect(editor.locator(`[data-chat-id="${chatId}"]`)).toHaveCount(1)
  await editor.pressSequentially(' hello')
  await expect(editor).toContainText('hello')
  await paste(page, otherId)
  await expect(editor).toContainText(otherId)
  await expect(editor.locator(`[data-chat-id="${otherId}"]`)).toHaveCount(0)
})

test('a lookup does not replace text that was edited while it was pending', async ({ page }) => {
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/sessions/*', async route => {
    await pending
    await route.fulfill({ json: { id: chatId } })
  })
  await page.goto('/src/e2e-fixtures/index.html')
  await page.evaluate(() => import('/src/e2e-fixtures/chat-column-alignment.tsx'))
  const editor = page.locator('[contenteditable="true"]')
  await editor.click()
  await paste(page, chatId)
  await editor.pressSequentially('x')
  release()
  await expect(editor).toContainText(`${chatId}x`)
  await expect(editor.locator('[data-segment-type="chat"]')).toHaveCount(0)
})
