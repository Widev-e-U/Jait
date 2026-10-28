import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

async function openFixture(page: Page, width = 1280, queue = false) {
  await page.setViewportSize({ width, height: 900 })
  await page.goto(queue ? '/src/e2e-fixtures/index.html?queue=1' : '/src/e2e-fixtures/index.html', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => import('/src/e2e-fixtures/message-attachment-regressions.tsx'))
  await expect(page.getByTestId('composer').getByRole('textbox')).toBeVisible()
}

for (const action of ['click', 'enter', 'queue'] as const) {
  test(`submitted attachments clear before composer remount (${action})`, async ({ page }) => {
    await openFixture(page, 1280, action === 'queue')
    const composer = page.getByTestId('composer')
    await composer.locator('input[type="file"]').setInputFiles([
      { name: 'upload.txt', mimeType: 'text/plain', buffer: Buffer.from('fixture upload') },
      { name: 'upload.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9sAAAAASUVORK5CYII=', 'base64') },
    ])
    await expect(composer.getByRole('button', { name: 'Remove upload.txt' })).toBeVisible()
    await expect(composer.getByRole('textbox').locator('[data-segment-type="image"]')).toHaveCount(1)
    if (action === 'enter') await composer.getByRole('textbox').press('Enter')
    else await composer.getByRole('button', { name: action === 'queue' ? 'Add to queue (Enter)' : 'Send message', exact: true }).click()
    await expect(page.getByTestId('sent').getByText('upload.txt', { exact: true })).toBeVisible()
    await expect(composer.locator('[data-attachment-list]')).toHaveCount(0)
    await expect(composer.getByRole('textbox').locator('[data-segment-type="image"]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Remount composer' }).click()
    await expect(composer.locator('[data-attachment-list]')).toHaveCount(0)
    await expect(composer.getByRole('textbox')).toHaveText('')
    await expect(composer.getByRole('button', { name: action === 'queue' ? 'Sending' : 'Send message', exact: true })).toBeDisabled()
  })
}

test('image viewport and portal controls never start message editing', async ({ page }) => {
  await openFixture(page)
  const sent = page.getByTestId('sent')
  await sent.getByRole('button', { name: 'View image 1: first.png' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('region', { name: 'Image viewport' }).click()
  await expect(sent.getByRole('button', { name: 'Cancel editing message' })).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect(sent.getByRole('button', { name: 'Cancel editing message' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await sent.getByText('Before ', { exact: true }).click()
  await expect(sent.getByRole('button', { name: 'Cancel editing message' })).toBeVisible()
})

for (const width of [390, 1280]) {
  test(`user message controls stay clear of message text at ${width}px`, async ({ page }) => {
    await openFixture(page, width)
    const sent = page.getByTestId('sent')
    const bubble = sent.locator('[data-message-from="user"]').last()
    await bubble.hover()
    const controls = sent.getByRole('button', { name: width < 768 ? 'Message actions' : 'Edit message', exact: true })
    await expect(controls).toBeVisible()
    const bubbleBox = (await bubble.boundingBox())!
    const controlsBox = (await controls.boundingBox())!
    if (width < 768) {
      expect(controlsBox.y).toBeGreaterThanOrEqual(bubbleBox.y)
      expect(controlsBox.y + controlsBox.height).toBeLessThanOrEqual(bubbleBox.y + bubbleBox.height)
    } else {
      // Desktop actions sit above the message so they do not intercept text clicks.
      expect(controlsBox.y + controlsBox.height).toBeLessThanOrEqual(bubbleBox.y)
      expect(controlsBox.x).toBeGreaterThanOrEqual(0)
      expect(controlsBox.x + controlsBox.width).toBeLessThanOrEqual(width)
    }
    if (width < 768) {
      await controls.click()
      await page.getByRole('menuitem', { name: 'Edit message', exact: true }).click()
    } else await controls.click()
    await expect(sent.getByRole('button', { name: 'Cancel editing message' })).toBeVisible()
  })

  test(`user image gallery sits above an evenly padded bubble at ${width}px`, async ({ page }) => {
    await openFixture(page, width)
    const sent = page.getByTestId('sent')
    const bubble = sent.locator('[data-message-from="user"]').last()
    const padding = await bubble.evaluate(el => {
      const style = getComputedStyle(el)
      return { top: style.paddingTop, bottom: style.paddingBottom }
    })
    expect(padding.bottom).toBe(padding.top)
    const gallery = sent.locator('[data-user-message-images]')
    await expect(gallery).toBeVisible()
    expect((await gallery.boundingBox())!.y + (await gallery.boundingBox())!.height).toBeLessThanOrEqual((await bubble.boundingBox())!.y)
    await expect(gallery.locator('[data-image-number]')).toHaveText(['[1]', '[2]'])
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/', `user-image-gallery-${width}.png`) })
  })

  test(`queued editing preserves inline image positions and explicit removals at ${width}px`, async ({ page }) => {
    await openFixture(page, width)
    const queue = page.getByTestId('queue')
    await queue.getByRole('button', { name: 'Edit message', exact: true }).click()
    const editing = page.locator('[data-queue-editor]')
    const editor = editing.locator('[contenteditable="true"]')
    await expect(editor).toBeVisible()
    await expect(editor.locator('[data-image-name]')).toHaveText(['first.png', 'second.png'])
    await expect(editor.locator('[data-image-number]')).toHaveCount(0)
    await editor.getByRole('button', { name: 'Remove first.png' }).click()
    await editing.getByRole('button', { name: 'Remove notes.txt' }).click()
    await editor.press('End')
    await page.keyboard.type(' changed')
    await editing.getByRole('button', { name: 'Save changes', exact: true }).click()
    await expect(editor).toHaveCount(0)
    const saved = JSON.parse((await page.getByTestId('queue-state').textContent())!)[0]
    expect(saved.attachments.map((item: { name: string }) => item.name)).toEqual(['second.png'])
    expect(saved.displaySegments.map((item: { type: string }) => item.type)).toEqual(['text', 'image', 'text'])
    expect(saved.displaySegments[2].text).toContain('changed')
    await queue.getByRole('button', { name: 'Edit message', exact: true }).click()
    await expect(editing.locator('[contenteditable="true"] [data-image-name]')).toHaveText(['second.png'])
    await editing.getByRole('button', { name: 'Cancel editing message' }).click()
    await expect(editor).toHaveCount(0)
    await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/', `queued-message-edit-${width}.png`) })
  })
}

for (const action of ['click', 'enter'] as const) {
  for (const success of [true, false]) {
    test(`sent message draft stays visible while saving (${action}, ${success ? 'success' : 'rejection'})`, async ({ page }) => {
      await openFixture(page)
      const sent = page.getByTestId('sent')
      await sent.getByText('Before ', { exact: true }).click()
      const editor = sent.getByRole('textbox')
      await expect(editor).toBeVisible()
      await editor.press('End')
      await page.keyboard.type(' edited')
      const draft = await editor.textContent()
      if (action === 'enter') await editor.press('Enter')
      else await sent.getByRole('button', { name: 'Send message', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Complete edit' })).toBeVisible()
      // The edit request is held pending: text and attachments must remain on screen.
      await expect(editor).toHaveText(draft!)
      await expect(sent.getByRole('button', { name: 'Remove notes.txt' })).toBeVisible()
      await page.getByRole('button', { name: success ? 'Complete edit' : 'Reject edit' }).click()
      if (success) {
        await expect(editor).toHaveCount(0)
        await expect(sent).toContainText('edited')
      } else {
        await expect(editor).toHaveText(draft!)
        await expect(sent.getByRole('button', { name: 'Send message', exact: true })).toBeEnabled()
      }
    })
  }
}
