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

test('resolves the first paste after the empty composer updates', async ({ page }) => {
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/sessions/*', async route => {
    await pending
    await route.fulfill({ json: { id: chatId, title: 'Earlier chat' } })
  })
  await page.goto('/src/e2e-fixtures/index.html')
  await page.evaluate(() => import('/src/e2e-fixtures/chat-column-alignment.tsx'))
  const editor = page.locator('[contenteditable="true"]')
  await editor.click()
  await paste(page, chatId)
  await expect(editor).toContainText(chatId)
  await expect(page.getByText('Message Jait', { exact: true })).toHaveCount(0)
  release()
  await expect(editor.locator(`[data-chat-id="${chatId}"]`)).toHaveCount(1)
})


test('resolves a chat ID copied as structured text on the first paste', async ({ page }) => {
  await page.route('**/api/sessions/*', route => route.fulfill({ json: { id: chatId, title: 'Earlier chat' } }))
  await page.goto('/src/e2e-fixtures/index.html')
  await page.evaluate(() => import('/src/e2e-fixtures/chat-column-alignment.tsx'))
  const editor = page.locator('[contenteditable="true"]')
  await editor.click()
  await editor.evaluate((element, id) => {
    const clipboard = new DataTransfer()
    clipboard.setData('text/plain', id)
    clipboard.setData('application/x-jait-user-message+json', JSON.stringify({ version: 1, segments: [{ type: 'text', text: id }] }))
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }))
  }, chatId)
  await expect(editor.locator(`[data-chat-id="${chatId}"]`)).toHaveCount(1)
  await expect(editor.locator('[data-segment-type="chat"]')).toContainText('Earlier chat')
})

test('resolves a first mobile insertion without a clipboard paste event', async ({ page }) => {
  await page.route('**/api/sessions/*', route => route.fulfill({ json: { id: chatId, title: 'Earlier chat' } }))
  await page.goto('/src/e2e-fixtures/index.html')
  await page.evaluate(() => import('/src/e2e-fixtures/chat-column-alignment.tsx'))
  const editor = page.locator('[contenteditable="true"]')
  await editor.click()
  await editor.evaluate((element, id) => {
    element.appendChild(document.createTextNode(id))
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: id }))
  }, chatId)
  await expect(editor.locator(`[data-chat-id="${chatId}"]`)).toHaveCount(1)
})

test('converts a chat token inserted by a mobile keyboard without a paste event', async ({ page }) => {
  await page.goto('/src/e2e-fixtures/index.html')
  await page.evaluate(() => import('/src/e2e-fixtures/chat-column-alignment.tsx'))
  const editor = page.locator('[contenteditable="true"]')
  await editor.click()
  await editor.evaluate((element, id) => {
    const text = `look at [chat:${id}] please`
    element.appendChild(document.createTextNode(text))
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
  }, chatId)
  await expect(editor.locator(`[data-chat-id="${chatId}"]`)).toHaveCount(1)
  await expect(editor).toContainText('look at')
  await expect(editor).toContainText('please')
  await editor.pressSequentially('!')
  await expect(editor).toContainText('please!')
})

test('converts a mobile insertion inside an existing draft', async ({ page }) => {
  await page.goto('/src/e2e-fixtures/index.html')
  await page.evaluate(() => import('/src/e2e-fixtures/chat-column-alignment.tsx'))
  const editor = page.locator('[contenteditable="true"]')
  await editor.click()
  await editor.evaluate((element, id) => {
    const token = `[chat:${id}]`
    const node = document.createTextNode(`before ${token} after`)
    element.appendChild(node)
    const range = document.createRange()
    range.setStart(node, `before ${token}`.length)
    range.collapse(true)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: token }))
  }, chatId)
  await expect(editor.locator(`[data-chat-id="${chatId}"]`)).toHaveCount(1)
  await editor.pressSequentially('!')
  await expect(editor).toContainText('before')
  await expect(editor).toContainText('! after')
})

test('resolves a paste when the browser replaces an equivalent text node', async ({ page }) => {
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/sessions/*', async route => {
    await pending
    await route.fulfill({ json: { id: chatId, title: 'Earlier chat' } })
  })
  await page.goto('/src/e2e-fixtures/index.html')
  await page.evaluate(() => import('/src/e2e-fixtures/chat-column-alignment.tsx'))
  const editor = page.locator('[contenteditable="true"]')
  await editor.click()
  await paste(page, chatId)
  await editor.evaluate(element => { element.textContent = element.textContent })
  release()
  await expect(editor.locator(`[data-chat-id="${chatId}"]`)).toHaveCount(1)
})


test('copies an explicit chat reference and resolves the first real clipboard paste', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Clipboard permissions require Chromium')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  let lookups = 0
  await page.route('**/api/sessions/*', route => {
    lookups++
    return route.abort()
  })
  await page.goto(`/src/e2e-fixtures/index.html?chatId=${chatId}`)
  await page.evaluate(() => import('/src/e2e-fixtures/chat-column-alignment.tsx'))
  const editor = page.locator('[contenteditable="true"]')
  await page.getByRole('button', { name: 'Copy chat reference', exact: true }).click()
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`[chat:${chatId}]`)
  await editor.click()
  await editor.press('Control+V')
  await expect(editor.locator(`[data-chat-id="${chatId}"]`)).toHaveCount(1)
  await editor.pressSequentially(' hello')
  await expect(editor).toContainText('hello')
  expect(lookups).toBe(0)
})

test('explicit chat reference works with a mobile viewport and text-only structured clipboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/src/e2e-fixtures/index.html')
  await page.evaluate(() => import('/src/e2e-fixtures/chat-column-alignment.tsx'))
  const editor = page.locator('[contenteditable="true"]')
  await editor.click()
  await editor.evaluate((element, id) => {
    const text = `[chat:${id}]`
    const clipboard = new DataTransfer()
    clipboard.setData('text/plain', text)
    clipboard.setData('application/x-jait-user-message+json', JSON.stringify({ version: 1, segments: [{ type: 'text', text }] }))
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }))
  }, chatId)
  await expect(editor.locator(`[data-chat-id="${chatId}"]`)).toHaveCount(1)
})
