import { test, expect } from '@playwright/test'

test('chat divider drags, clamps, resets and responds to keys while both chats stream', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto('/parallel-chat-repro.html')
  await page.waitForFunction(() => Reflect.get(window, '__panelStreamsReady')?.())
  const panels = page.getByRole('region', { name: 'Secondary chat panel' })
  const divider = page.getByRole('separator', { name: 'Resize chat panels' })
  await expect(divider).toBeVisible()
  const initial = (await panels.first().boundingBox())!.width
  const box = (await divider.boundingBox())!
  await page.evaluate(() => { void Reflect.get(window, '__streamBothPanels')() })
  await page.mouse.move(box.x + box.width / 2, 300)
  await page.mouse.down()
  await page.mouse.move(box.x + 154, 300, { steps: 8 })
  await page.mouse.up()
  expect((await panels.first().boundingBox())!.width).toBeGreaterThan(initial + 130)
  // Stream-triggered React renders must preserve the drag result.
  await expect(panels.first()).toContainText('word29')
  await expect(panels.last()).toContainText('word29')
  expect((await panels.first().boundingBox())!.width).toBeGreaterThan(initial + 130)
  await divider.focus()
  await page.keyboard.press('Home')
  expect((await panels.first().boundingBox())!.width).toBeCloseTo(220, 0)
  await page.keyboard.press('ArrowRight')
  expect((await panels.first().boundingBox())!.width).toBeCloseTo(252, 0)
  await divider.dblclick()
  expect((await panels.first().boundingBox())!.width).toBeCloseTo(initial, 0)
  await page.keyboard.press('End')
  expect((await panels.last().boundingBox())!.width).toBeCloseTo(220, 0)
})


test('opens and closes the editor beside two streaming conversations', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto('/parallel-chat-repro.html')
  await page.waitForFunction(() => Reflect.get(window, '__panelStreamsReady')?.())
  const panels = page.getByRole('region', { name: 'Secondary chat panel' })
  const initial = (await panels.first().boundingBox())!.width
  await page.evaluate(() => { void Reflect.get(window, '__streamBothPanels')() })
  await page.getByRole('button', { name: 'Toggle editor fixture' }).click()
  await expect(page.locator('.monaco-editor').first()).toBeVisible()
  await expect(panels.first()).toContainText('word29')
  await expect(panels.last()).toContainText('word29')
  expect((await panels.first().boundingBox())!.width).toBeLessThan(initial)
  for (let index = 0; index < 5; index++) {
    await page.getByRole('button', { name: 'Toggle editor fixture' }).click()
    await page.getByRole('button', { name: 'Toggle editor fixture' }).click()
  }
  await expect(panels).toHaveCount(2)
  expect(errors).toEqual([])
})
