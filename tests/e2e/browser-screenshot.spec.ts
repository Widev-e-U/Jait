import { expect, test } from '@playwright/test'

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

test('desktop screenshot loads with authentication and expands', async ({ page }) => {
  const authorization: (string | undefined)[] = []
  await page.route('**/api/browser/screenshot?**', async (route) => {
    const token = route.request().headers().authorization
    authorization.push(token)
    await route.fulfill(token === 'Bearer screenshot-test-token'
      ? { status: 200, contentType: 'image/png', body: PNG }
      : { status: 401, contentType: 'application/json', body: '{"detail":"login_required"}' })
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => import('/src/e2e-fixtures/browser-screenshot.tsx'))
  const image = page.getByRole('img', { name: 'Browser screenshot' })
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  expect(authorization).toEqual(['Bearer screenshot-test-token'])
  await expect(page.getByText('Screenshot unavailable.', { exact: false })).toHaveCount(0)
  await page.getByRole('button', { name: 'Expand browser screenshot' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect.poll(() => page.getByRole('dialog').getByRole('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  expect(authorization).toHaveLength(1)
})

test('web screenshots use the existing login cookie', async ({ page, context }) => {
  await context.addCookies([{ name: 'jait_token', value: 'cookie-test-token', url: process.env.FRONTEND_URL! }])
  await page.route('**/api/browser/screenshot?**', async (route) => {
    expect(route.request().headers().authorization).toBeUndefined()
    const headers = await route.request().allHeaders()
    await route.fulfill(headers.cookie?.includes('jait_token=cookie-test-token')
      ? { status: 200, contentType: 'image/png', body: PNG }
      : { status: 401, body: 'login_required' })
  })
  await page.goto('/?web', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => import('/src/e2e-fixtures/browser-screenshot.tsx'))
  await expect.poll(() => page.getByRole('img', { name: 'Browser screenshot' }).evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
})

test('missing screenshots still show unavailable', async ({ page }) => {
  await page.route('**/api/browser/screenshot?**', (route) => route.fulfill({ status: 404, body: 'not found' }))
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => import('/src/e2e-fixtures/browser-screenshot.tsx'))
  await expect(page.getByText('Screenshot unavailable.', { exact: false })).toBeVisible()
})

test('blob URLs are replaced and released; external images receive no token', async ({ page }) => {
  await page.addInitScript(() => {
    const revoke = URL.revokeObjectURL.bind(URL)
    ;(window as any).revokedImages = []
    URL.revokeObjectURL = (url) => { (window as any).revokedImages.push(url); revoke(url) }
  })
  await page.route('**/api/browser/screenshot?**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }))
  await page.route('https://external.test/image.png', async (route) => {
    expect(route.request().headers().authorization).toBeUndefined()
    await route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => import('/src/e2e-fixtures/browser-screenshot.tsx'))
  const image = page.getByRole('img', { name: 'Browser screenshot' })
  await expect(image).toHaveAttribute('src', /^blob:/)
  const first = await image.getAttribute('src')
  await page.getByRole('button', { name: 'Change screenshot' }).click()
  await expect.poll(() => image.getAttribute('src')).not.toBe(first)
  await expect(image).toHaveAttribute('src', /^blob:/)
  const second = await image.getAttribute('src')
  await expect.poll(() => page.evaluate(() => (window as any).revokedImages)).toContain(first)
  await page.getByRole('button', { name: 'External screenshot' }).click()
  await expect(image).toHaveAttribute('src', 'https://external.test/image.png')
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  await expect.poll(() => page.evaluate(() => (window as any).revokedImages)).toContain(second)
  await page.getByRole('button', { name: 'Change screenshot' }).click()
  await expect(image).toHaveAttribute('src', /^blob:/)
  const last = await image.getAttribute('src')
  await page.getByRole('button', { name: 'Unmount screenshot' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).revokedImages)).toContain(last)
})

test('screenshots embedded in markdown use authenticated images and links', async ({ page }) => {
  await page.route('**/api/browser/screenshot?**', async (route) => {
    expect(route.request().headers().authorization).toBe('Bearer screenshot-test-token')
    await route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
  })
  await page.goto('/?markdown', { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => import('/src/e2e-fixtures/browser-screenshot.tsx'))
  const image = page.getByRole('img', { name: 'Markdown screenshot' })
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  await expect(image.locator('..')).toHaveAttribute('href', /^blob:/)
})
