import { test, expect } from '@playwright/test'
import path from 'node:path'

const viewerRoot = path.resolve(__dirname, '../../apps/web/public/noVNC')
const shots = path.resolve(__dirname, '../../.jait/shots')

test.use({ hasTouch: true, isMobile: true })

for (const width of [320, 390]) {
  test(`phone browser takeover, options and keyboard work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    let shared = true
    const session = () => ({
      sessionId: 'chat-fixture', browserId: 'browser-chat-fixture', status: 'ready',
      url: '/noVNC/vnc_lite.html?path=api/live-view/6080/websockify', sharedWithAgent: shared,
      metrics: { url: 'https://example.test/login' },
    })
    await page.route('**/api/preview/session/chat-fixture', route => route.fulfill({ json: { session: session() } }))
    await page.route('**/api/preview/share', route => {
      shared = route.request().postDataJSON().sharedWithAgent
      return route.fulfill({ json: { session: session() } })
    })
    await page.route('**/api/preview/access', route => route.fulfill({ json: { url: route.request().postDataJSON().source } }))
    // Exercise the shipping viewer and keyboard code; replace only the VNC server transport.
    await page.route('**/noVNC/**', route => route.fulfill({
      path: path.join(viewerRoot, new URL(route.request().url()).pathname.slice('/noVNC/'.length)),
    }))
    await page.route('**/noVNC/core/rfb.js', route => route.fulfill({ contentType: 'text/javascript', body: `
      export default class RFB extends EventTarget {
        constructor(screen) {
          super(); window.sentKeys = [];
          screen.innerHTML = '<canvas tabindex="0" aria-label="Remote screen"></canvas>';
          queueMicrotask(() => this.dispatchEvent(new Event('connect')));
        }
        sendKey(keysym) { if (!this.viewOnly) window.sentKeys.push(keysym); }
      }
    ` }))
    await page.goto('/chat-browser-repro.html?mobile-header')
    const panel = page.getByRole('region', { name: 'Chat browser', exact: true })
    const frame = page.frameLocator('iframe[title="Agent browser"]')
    const url = panel.getByRole('textbox', { name: 'Browser URL' })
    await expect(url).toHaveAttribute('readonly', '')
    await expect(frame.getByRole('button', { name: 'Toggle keyboard' })).toBeHidden()
    const takeControl = panel.getByRole('button', { name: 'Take control', exact: true })
    await expect(takeControl).toBeEnabled()
    const headerBounds = (await page.locator('[data-app-header]').boundingBox())!
    await expect.poll(async () => (await panel.boundingBox())!.y).toBeGreaterThanOrEqual(headerBounds.y + headerBounds.height + 8)
    const panelBounds = (await panel.boundingBox())!
    const urlBounds = (await url.boundingBox())!
    expect(urlBounds.width).toBeGreaterThanOrEqual(30)
    expect(panelBounds.y).toBeGreaterThanOrEqual(headerBounds.y + headerBounds.height + 8)
    for (const control of [url, panel.getByRole('button', { name: 'Go to URL' }), panel.getByRole('button', { name: 'Refresh page' }), panel.getByRole('button', { name: 'Browser tools', exact: true }), takeControl, panel.getByLabel('Browser view options', { exact: true }), panel.getByRole('button', { name: 'Minimize browser' })]) {
      const bounds = (await control.boundingBox())!
      expect(bounds.x).toBeGreaterThanOrEqual(panelBounds.x)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(panelBounds.x + panelBounds.width)
      expect(bounds.height).toBeGreaterThanOrEqual(32)
      expect(Math.abs(bounds.y - urlBounds.y)).toBeLessThanOrEqual(1)
      expect(await control.evaluate(element => {
        const rect = element.getBoundingClientRect()
        return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
      })).toBe(true)
    }
    await takeControl.tap()
    await expect(panel.getByRole('button', { name: 'Share with agent', exact: true })).toBeVisible()
    await expect(url).not.toHaveAttribute('readonly')
    await url.fill('https://example.test/login')
    await panel.getByRole('button', { name: 'Browser tools', exact: true }).tap()
    await expect(panel.getByRole('button', { name: 'Browser tools', exact: true })).toHaveAttribute('aria-expanded', 'true')
    await panel.getByRole('button', { name: 'Browser tools', exact: true }).tap()
    const keyboard = frame.getByRole('button', { name: 'Toggle keyboard' })
    await expect(keyboard).toBeVisible()
    const draft = page.getByRole('textbox', { name: 'Chat draft' })
    await expect(draft).toBeVisible()
    await keyboard.tap()
    await expect(draft).toBeHidden()
    // A message from another window must not control this chat's composer.
    await page.evaluate(() => window.postMessage({ type: 'jait-vnc-keyboard', open: false }, location.origin))
    await expect(draft).toBeHidden()
    const input = frame.getByRole('textbox', { name: 'Remote keyboard input' })
    await expect(input).toBeFocused()
    await expect(keyboard).toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.insertText('phone')
    await expect.poll(() => frame.locator('html').evaluate(() => Reflect.get(window, 'sentKeys'))).toEqual([112, 104, 111, 110, 101])
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Enter')
    await expect.poll(() => frame.locator('html').evaluate(() => Reflect.get(window, 'sentKeys'))).toContain(0xff0d)
    await keyboard.tap()
    await expect(input).not.toBeFocused()
    await expect(keyboard).toHaveAttribute('aria-pressed', 'false')
    await expect(draft).toBeVisible()
    await expect(draft).toHaveValue('Keep my draft')
    await keyboard.tap()
    await expect(draft).toBeHidden()
    await panel.getByRole('button', { name: 'Minimize browser' }).tap()
    await expect(draft).toBeVisible()
    await panel.getByRole('button', { name: 'Expand browser' }).tap()
    await expect(draft).toBeVisible()
    const options = panel.getByLabel('Browser view options', { exact: true })
    await options.tap()
    await panel.getByRole('button', { name: 'Zoom in', exact: true }).tap()
    await expect(panel.getByLabel('View zoom', { exact: true })).toHaveText('120%')
    await panel.getByRole('button', { name: 'Reset view', exact: true }).tap()
    await page.screenshot({ path: path.join(shots, `browser-mobile-controls-${width}.png`) })
    await options.tap()
    await panel.getByRole('button', { name: 'Share with agent', exact: true }).tap()
    await expect(frame.getByRole('button', { name: 'Toggle keyboard' })).toBeHidden()
    await panel.getByRole('button', { name: 'Minimize browser' }).tap()
    await panel.getByRole('button', { name: 'Expand browser' }).tap()
    await expect(panel.getByRole('button', { name: 'Take control', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
}

test('mouse mode moves relatively, clicks, scrolls, and releases a cancelled drag', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/noVNC/**', route => route.fulfill({
    path: path.join(viewerRoot, new URL(route.request().url()).pathname.slice('/noVNC/'.length)),
  }))
  await page.route('**/noVNC/core/rfb.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export default class RFB extends EventTarget {
      constructor(screen) {
        super(); window.pointerEvents = [];
        screen.innerHTML = '<div style="width:100%;height:100%;overflow:auto"><canvas aria-label="Remote screen" style="width:100%;height:100%"></canvas></div>';
        this._screen = screen.firstChild;
        const canvas = screen.querySelector('canvas');
        let scale = 1;
        this._display = { get scale() { return scale; }, set scale(value) { scale = value; canvas.style.width = innerWidth * value + 'px'; canvas.style.height = innerHeight * value + 'px'; } };
        queueMicrotask(() => this.dispatchEvent(new Event('connect')));
      }
      _handleMouseMove(x, y) { window.pointerEvents.push({ x, y, mask: -1 }); }
      _handleMouseButton(x, y, mask) { window.pointerEvents.push({ x, y, mask }); }
      sendKey() {}
    }
  ` }))
  await page.goto('/noVNC/vnc_lite.html')
  const mode = page.getByRole('button', { name: 'Toggle mouse mode' })
  await expect(mode).toHaveAttribute('aria-pressed', 'true')
  const initial = await page.locator('[data-touch-cursor]').boundingBox()
  expect(initial).not.toBeNull()
  // Deliver real DOM touch sequences to the shipping gesture handler. The fake
  // RFB records the protocol boundary so duplicate direct-touch clicks are visible.
  const touch = async (type: string, points: number[][]) => page.evaluate(({ type, points }) => {
    const canvas = document.querySelector('canvas')!
    canvas.dispatchEvent(new TouchEvent(type, {
      bubbles: true, cancelable: true,
      touches: points.map(([clientX, clientY], identifier) => new Touch({ identifier, target: canvas, clientX, clientY })),
    }))
  }, { type, points })
  const events = () => page.evaluate(() => Reflect.get(window, 'pointerEvents') as { x: number; y: number; mask: number }[])
  const clear = () => page.evaluate(() => { Reflect.set(window, 'pointerEvents', []) })
  await touch('touchstart', [[10, 10]])
  await touch('touchmove', [[50, 30]])
  await touch('touchend', [])
  const moved = (await events()).at(-1)!
  expect(moved.mask).toBe(-1)
  expect(moved.x).toBeCloseTo(initial!.x + 40, 0)
  expect(moved.y).toBeCloseTo(initial!.y + 20, 0)
  await clear()
  await touch('touchstart', [[300, 300]])
  await touch('touchend', [])
  expect((await events()).map(event => event.mask)).toEqual([1, 0])
  expect((await events())[0].x).toBe(moved.x)
  // Double-tap and hold starts a left drag; cancellation must release the button.
  await clear()
  await touch('touchstart', [[100, 100]])
  await touch('touchmove', [[120, 110]])
  await touch('touchcancel', [])
  expect((await events()).map(event => event.mask)).toEqual([1, -1, 0])
  await clear()
  await touch('touchstart', [[100, 100], [140, 100]])
  await touch('touchend', [])
  expect((await events()).map(event => event.mask)).toEqual([4, 0])
  await clear()
  await touch('touchstart', [[100, 100], [140, 100], [180, 100]])
  await touch('touchmove', [[100, 52], [140, 52], [180, 52]])
  await touch('touchend', [])
  expect((await events()).map(event => event.mask)).toEqual([16, 0, 16, 0])
  await clear()
  await touch('touchstart', [[100, 100]])
  await expect.poll(async () => (await events()).map(event => event.mask)).toEqual([4, 0])
  await touch('touchend', [])
  expect((await events()).map(event => event.mask)).toEqual([4, 0])
  // A pinch changes the local view without sending clicks or remote wheel events.
  await clear()
  const beforeZoom = (await page.locator('canvas').boundingBox())!
  await touch('touchstart', [[150, 300], [250, 300]])
  for (let offset = 1; offset <= 50; offset++) {
    await touch('touchmove', [[150 - offset, 300], [250 + offset, 300]])
  }
  await touch('touchend', [])
  expect((await page.locator('canvas').boundingBox())!.width).toBeGreaterThan(beforeZoom.width * 1.9)
  expect(await events()).toEqual([])
  const beforePan = await page.locator('canvas').evaluate(canvas => canvas.parentElement!.scrollLeft)
  await touch('touchstart', [[150, 300], [250, 300]])
  await touch('touchmove', [[130, 300], [230, 300]])
  await touch('touchend', [])
  expect(await page.locator('canvas').evaluate(canvas => canvas.parentElement!.scrollLeft)).toBeGreaterThan(beforePan)
  expect(await events()).toEqual([])
  await mode.tap()
  await expect(mode).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('[data-touch-cursor]')).toBeHidden()
  await clear()
  await touch('touchstart', [[100, 100]])
  await touch('touchend', [])
  expect(await events()).toEqual([])
  await page.reload()
  await expect(mode).toHaveAttribute('aria-pressed', 'false')
  await mode.tap()
  await expect(page.locator('[data-touch-cursor]')).toBeVisible()
  await page.screenshot({ path: path.join(shots, 'browser-mobile-mouse-cursor.png') })
})
