import { expect, test } from '@playwright/test'

test('persisted image cards load with their owning chat and refetch on chat change', async ({ page }) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9sAAAAASUVORK5CYII=', 'base64')
  const requests: { path: string | null; sessionId: string | null }[] = []
  await page.route('**/api/browser/screenshot?**', async route => {
    const query = new URL(route.request().url()).searchParams
    requests.push({ path: query.get('path'), sessionId: query.get('sessionId') })
    await route.fulfill({
      status: query.get('sessionId') ? 200 : 404,
      contentType: 'image/png', body: png,
    })
  })
  // Keep the real Vite page/preamble, but mount only this fixture instead of
  // starting the full application and its background requests.
  await page.route('**/src/main.tsx', route => route.fulfill({ contentType: 'text/javascript', body: '' }))
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => import('/src/e2e-fixtures/chat-project-images.tsx'))
  for (const tool of ['image.view', 'browser.screenshot']) {
    const image = page.getByTestId(tool).locator('img')
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(1)
  }
  expect(requests).toHaveLength(2)
  expect(requests.every(r => r.path === '.jait/shots/provider-selector-390.png' && r.sessionId === 'image-chat')).toBe(true)
  await page.getByRole('button', { name: 'Switch chat' }).click()
  await expect.poll(() => requests.filter(r => r.sessionId === 'second-chat').length).toBe(2)
  for (const tool of ['image.view', 'browser.screenshot']) {
    const image = page.getByTestId(tool).locator('img')
    await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(1)
  }
  await expect(page.getByText('Image unavailable.')).toHaveCount(0)
})
