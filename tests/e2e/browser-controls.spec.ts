import { test, expect } from '@playwright/test'
import path from 'node:path'

const shots = path.resolve(__dirname, '../../.jait/shots')

test.beforeEach(async ({ page }) => {
  await page.route('**/api/preview/access', route => route.fulfill({ json: { url: '/noVNC/vnc.html?path=preview/scoped/live/6080/websockify' } }))
  await page.route('**/api/preview/session/controls', route => route.fulfill({ json: { session: { metrics: { url: 'https://example.test' } } } }))
  await page.route('**/noVNC/vnc.html**', route => route.fulfill({
    contentType: 'text/html',
    body: '<html><body style="margin:0;background:#e0f2fe"><button style="margin:80px" id="page-button" onclick="this.textContent=\'Clicked\'">Page button</button><input aria-label="Page input"><div style="height:4000px;padding:30px">Scrollable remote page</div></body></html>',
  }))
  // Let Vite inject the React refresh preamble before importing the fixture.
  await page.goto('/src/e2e-fixtures/index.html')
  await page.evaluate(() => import('/src/e2e-fixtures/browser-controls.tsx'))
})

test('wheel scrolls the page without activating a mode', async ({ page }) => {
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('#page-button')).toBeVisible()
  const bounds = await page.locator('iframe').boundingBox()
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2)
  await page.mouse.wheel(0, 400)
  await expect.poll(() => frame.locator('html').evaluate(() => window.scrollY)).toBeGreaterThan(0)
})

test('clicks and scrolling reach the page immediately and after leaving the view', async ({ page }) => {
  const frame = page.frameLocator('iframe')
  await frame.locator('#page-button').click({ timeout: 3000 })
  await expect(frame.locator('#page-button')).toHaveText('Clicked')
  const bounds = await page.locator('iframe').boundingBox()
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2)
  await page.mouse.wheel(0, 400)
  await expect.poll(() => frame.locator('html').evaluate(() => window.scrollY)).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Outside browser' }).hover()
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  const previous = await frame.locator('html').evaluate(() => window.scrollY)
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2)
  await page.mouse.wheel(0, 400)
  await expect.poll(() => frame.locator('html').evaluate(() => window.scrollY)).toBeGreaterThan(previous)
})

test('adjust view has scoped keys and returns to page interaction', async ({ page }) => {
  const adjust = page.getByRole('button', { name: 'Adjust view', exact: true })
  await adjust.click()
  await expect(adjust).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('+')
  await expect(page.getByLabel('View zoom')).toHaveText('120%')
  await page.keyboard.press('ArrowRight')
  await expect(page.locator('iframe').locator('..')).toHaveCSS('transform', /matrix\(1.2, 0, 0, 1.2,/)
  await page.keyboard.press('0')
  await expect(page.getByLabel('View zoom')).toHaveText('100%')
  await page.keyboard.press('Escape')
  await expect(adjust).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('group', { name: 'Remote view controls' }).focus()
  await page.keyboard.press('v')
  await expect(adjust).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('v')
  await expect(adjust).toHaveAttribute('aria-pressed', 'false')
  const input = page.frameLocator('iframe').getByLabel('Page input')
  await input.click()
  await input.pressSequentially('v f 0 + -')
  await expect(input).toHaveValue('v f 0 + -')
  await expect(adjust).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByLabel('View zoom')).toHaveText('100%')
})

test('fullscreen includes address bar without reloading the live iframe', async ({ page }) => {
  await page.frameLocator('iframe').locator('html').evaluate(el => el.setAttribute('data-session-marker', 'same-session'))
  await page.getByRole('button', { name: 'Enter fullscreen' }).click()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.hasAttribute('data-browser-layout'))).toBe(true)
  await expect(page.getByRole('textbox', { name: 'Browser URL' })).toBeVisible()
  await expect(page.frameLocator('iframe').locator('html')).toHaveAttribute('data-session-marker', 'same-session')
  await page.screenshot({ path: path.join(shots, 'browser-controls-fullscreen.png') })
  await page.getByRole('button', { name: 'Exit fullscreen' }).focus()
  await page.keyboard.press('f')
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true)
})
