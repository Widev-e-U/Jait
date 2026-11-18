import path from 'node:path'
import { expect, test, type Locator } from '@playwright/test'

async function pasteImage(editor: Locator, name = 'image.png') {
  await editor.evaluate((element, name) => {
    const canvas = document.createElement('canvas')
    canvas.width = 240
    canvas.height = 140
    const context = canvas.getContext('2d')!
    const number = element.querySelectorAll('[data-segment-type="image"]').length + 1
    context.fillStyle = number === 1 ? '#235c78' : '#71569a'
    context.fillRect(0, 0, 240, 140)
    context.fillStyle = '#ffffff'
    context.font = '20px sans-serif'
    context.fillText(`Image ${number}`, 24, 74)
    const bytes = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), char => char.charCodeAt(0))
    const clipboard = new DataTransfer()
    clipboard.items.add(new File([bytes], name, { type: 'image/png' }))
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }))
  }, name)
}

async function caretAtText(editor: Locator, text: string, offset: number) {
  await editor.evaluate((element, { text, offset }) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    let node: Node | null
    while ((node = walker.nextNode())) {
      if (node.textContent !== text || (node.parentElement?.closest('[data-chip-ref]'))) continue
      const range = document.createRange()
      range.setStart(node, offset)
      range.collapse(true)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      ;(element as HTMLElement).focus()
      return
    }
    throw new Error('Text node not found')
  }, { text, offset })
}

for (const width of [390, 1280]) {
  test(`pasted images keep position through send and edit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await page.evaluate(() => import('/src/e2e-fixtures/inline-images.tsx'))
    const composer = page.getByTestId('composer')
    const editor = composer.getByRole('textbox')
    await editor.fill('Before  between  after')
    await caretAtText(editor, 'Before  between  after', 7)
    await pasteImage(editor)
    await expect(editor.locator('[data-segment-type="image"]')).toHaveCount(1)
    await caretAtText(editor, ' between  after', 9)
    await pasteImage(editor)
    await expect(editor.locator('[data-segment-type="image"]')).toHaveCount(2)
    await expect(editor.locator('[data-image-name]')).toHaveText(['image.png', 'image (2).png'])
    await composer.getByRole('button', { name: 'Send message', exact: true }).click()
    const sent = page.getByTestId('sent')
    await expect(sent.locator('[data-user-message-images] img')).toHaveCount(2)
    await expect(sent.locator('[data-image-reference] [data-image-number]')).toHaveText(['[1]', '[2]'])
    const saved = () => page.getByTestId('saved-segments').textContent().then(text => JSON.parse(text!))
    expect((await saved()).map((segment: { type: string }) => segment.type)).toEqual(['text', 'image', 'text', 'image', 'text'])
    await expect(sent.locator('[data-image-reference] img')).toHaveCount(0)
    await sent.getByRole('button', { name: 'View image 2: image (2).png' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await sent.locator('[data-message-from="user"]').last().click({ position: { x: 12, y: 12 } })
    const edit = sent.getByRole('textbox')
    await expect(edit.locator('[data-segment-type="image"]')).toHaveCount(2)
    await expect(edit.locator('[data-image-name]')).toHaveText(['image.png', 'image (2).png'])
    await edit.getByRole('button', { name: 'Remove image.png', exact: true }).click()
    await expect(edit.locator('[data-image-name]')).toHaveText(['image (2).png'])
    await page.keyboard.press('Control+z')
    await expect(edit.locator('[data-segment-type="image"]')).toHaveCount(2)
    await edit.getByRole('button', { name: 'Remove image.png', exact: true }).click()
    await caretAtText(edit, ' after', 6)
    await page.keyboard.type(' changed')
    await sent.getByRole('button', { name: 'Send message', exact: true }).click()
    await expect(sent.locator('[data-image-reference] [data-image-number]')).toHaveText(['[1]'])
    expect((await saved()).map((segment: { type: string }) => segment.type)).toEqual(['text', 'image', 'text'])
    expect((await saved())[2].text).toContain('changed')
    await page.getByRole('button', { name: 'Reload saved message' }).click()
    await expect(sent.locator('[data-image-reference] [data-image-number]')).toHaveText(['[1]'])
    await sent.locator('[data-message-from="user"]').last().click({ position: { x: 12, y: 12 } })
    await expect(sent.getByRole('textbox').locator('[data-segment-type="image"]')).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await sent.getByRole('button', { name: 'Cancel editing message' }).click()
    await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/', `inline-images-${width}.png`) })
  })
}

test('pasting an image preserves its position while the file loads', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    const Original = window.FileReader
    window.FileReader = class extends Original {
      readAsDataURL(blob: Blob) { setTimeout(() => super.readAsDataURL(blob), 300) }
    }
  })
  await page.evaluate(() => import('/src/e2e-fixtures/inline-images.tsx'))
  const editor = page.getByTestId('composer').getByRole('textbox')
  await editor.fill('start end')
  await caretAtText(editor, 'start end', 6)
  await pasteImage(editor)
  await expect(page.getByTestId('composer').getByRole('button', { name: 'Send message', exact: true })).toBeDisabled()
  await page.keyboard.type('typing ')
  await expect(editor.locator('[data-segment-type="image"]')).toHaveCount(1)
  await page.getByTestId('composer').getByRole('button', { name: 'Send message', exact: true }).click()
  const saved = JSON.parse((await page.getByTestId('saved-segments').textContent())!)
  expect(saved.map((segment: { type: string }) => segment.type)).toEqual(['text', 'image', 'text'])
  expect(saved[0].text).toBe('start ')
  expect(saved[2].text).toBe('typing end')
})

test('inline image clipboard round trip and selection deletion do not orphan uploads', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => import('/src/e2e-fixtures/inline-images.tsx'))
  const composer = page.getByTestId('composer')
  const editor = composer.getByRole('textbox')
  await editor.focus()
  await pasteImage(editor)
  await expect(editor.locator('[data-segment-type="image"]')).toHaveCount(1)
  const copied = await editor.evaluate(element => {
    const selection = window.getSelection()!
    const range = document.createRange()
    range.selectNodeContents(element)
    selection.removeAllRanges()
    selection.addRange(range)
    const clipboard = new DataTransfer()
    element.dispatchEvent(new ClipboardEvent('copy', { clipboardData: clipboard, bubbles: true, cancelable: true }))
    return clipboard.getData('application/x-jait-user-message+json')
  })
  expect(JSON.parse(copied).segments[0].type).toBe('image')
  await page.keyboard.press('Backspace')
  await expect(editor.locator('[data-segment-type="image"]')).toHaveCount(0)
  await expect(composer.getByRole('button', { name: 'Send message', exact: true })).toBeDisabled()
  await editor.evaluate((element, copied) => {
    const clipboard = new DataTransfer()
    clipboard.setData('application/x-jait-user-message+json', copied)
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: clipboard, bubbles: true, cancelable: true }))
  }, copied)
  await expect(editor.locator('[data-segment-type="image"]')).toHaveCount(1)
  await composer.getByRole('button', { name: 'Send message', exact: true }).click()
  await expect(page.getByTestId('sent').locator('[data-user-message-images] img')).toHaveCount(1)
  expect(JSON.parse((await page.getByTestId('saved-segments').textContent())!).map((segment: { type: string }) => segment.type)).toEqual(['image'])
})
