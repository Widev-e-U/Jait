import { expect, test } from '@playwright/test'

async function openViewer(page: import('@playwright/test').Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => import('/src/e2e-fixtures/image-viewer.tsx'))
  await page.getByRole('button', { name: 'Expand image capture.svg' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect.poll(() => page.getByRole('dialog').getByRole('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1600)
  await page.getByRole('dialog').evaluate(async (el) => { await Promise.all(el.getAnimations().map(a => a.finished)) })
}

test('wheel zooms at the cursor, middle mouse pans, limits and reset work', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile-chrome', 'Mouse gestures are covered on desktop')
  await openViewer(page)
  const area = page.getByRole('region', { name: 'Image viewport' })
  const img = page.getByRole('dialog').getByRole('img')
  const original = (await img.boundingBox())!
  const bounds = (await area.boundingBox())!
  const x = bounds.x + bounds.width / 2 + 60
  const y = bounds.y + bounds.height / 2 + 40
  await page.mouse.move(x, y)
  await page.mouse.wheel(0, -230)
  await expect.poll(async () => (await img.boundingBox())!.width).toBeGreaterThan(original.width * 1.9)
  const zoomed = (await img.boundingBox())!
  // The point under the cursor stays in the same place after zooming.
  expect((x - zoomed.x) / zoomed.width).toBeCloseTo((x - original.x) / original.width, 2)
  const before = await img.getAttribute('style')
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(x + 50, y + 30, { steps: 5 })
  await page.mouse.up({ button: 'middle' })
  await expect(img).not.toHaveAttribute('style', before!)
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Reset zoom' }).click()
  await expect(page.getByLabel('Image zoom')).toHaveText('100%')
  await expect.poll(async () => (await img.boundingBox())!.width).toBeCloseTo(original.width, 0)
  for (let i = 0; i < 10; i++) await area.dispatchEvent('wheel', { deltaY: -300 })
  await expect(page.getByLabel('Image zoom')).toHaveText('1600%')
  await page.getByRole('button', { name: 'Reset zoom' }).click()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Expand image capture.svg' }).click()
  await expect(page.getByLabel('Image zoom')).toHaveText('100%')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('mobile pinch zooms and a single finger pans without scrolling the page', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'mobile-chrome', 'Uses a real mobile touch context')
  await openViewer(page)
  const area = page.getByRole('region', { name: 'Image viewport' })
  const img = page.getByRole('dialog').getByRole('img')
  const bounds = (await area.boundingBox())!
  const x = bounds.x + bounds.width / 2
  const y = bounds.y + bounds.height / 2
  const original = (await img.boundingBox())!
  const cdp = await context.newCDPSession(page)
  const touch = (id: number, x: number, y: number) => ({ id, x, y })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(1, x - 40, y), touch(2, x + 40, y)] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(1, x - 90, y), touch(2, x + 90, y)] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(async () => (await img.boundingBox())!.width).toBeGreaterThan(original.width * 2)
  const before = await img.getAttribute('style')
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(1, x, y)] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(1, x + 35, y + 40)] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(img).not.toHaveAttribute('style', before!)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await page.getByRole('button', { name: 'Reset zoom' }).tap()
  await expect(page.getByLabel('Image zoom')).toHaveText('100%')
  await page.getByRole('button', { name: 'Close', exact: true }).tap()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
