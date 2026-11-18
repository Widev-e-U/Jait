import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

// Load the fixture directly so App authentication/navigation cannot replace it
// while a recovery test is establishing its live-view connection. The shell has
// to come from Vite: a hand-written one never receives the React refresh
// preamble, and the fixture module then cannot mount.
async function openFixture(page: Page, query = '') {
  await page.goto(`/src/e2e-fixtures/index.html${query}`)
  await page.evaluate(() => import('/src/e2e-fixtures/browser-recovery.tsx'))
}

test('a dropped browser connection reconnects with a fresh scoped grant and preserves control', async ({ page }) => {
  let accessRequests = 0
  // The VNC transport is external; use the real viewer, wrapper, and grant lifecycle.
  await page.route('**/noVNC/core/rfb.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export default class RFB extends EventTarget {
      constructor(screen) {
        super(); this.screen = screen; window.__rfb = this;
        screen.textContent = 'Remote browser connected';
        queueMicrotask(() => this.dispatchEvent(new Event('connect')));
      }
      loseConnection() {
        this.screen.textContent = '';
        this.dispatchEvent(new CustomEvent('disconnect', { detail: { clean: false } }));
      }
      disconnect() {}
      focus() {}
      sendKey() {}
    }
  ` }))
  await page.route('**/api/preview/access', async route => {
    accessRequests++
    const { source } = route.request().postDataJSON()
    const url = new URL(source, 'http://gateway')
    url.searchParams.set('path', 'preview/scoped-test/live/6080/websockify')
    url.searchParams.set('grant', String(accessRequests))
    await route.fulfill({ json: { url: url.pathname + url.search } })
  })
  await openFixture(page)
  const browser = page.frameLocator('iframe[title="Remote session"]')
  await expect(browser.getByText('Remote browser connected')).toBeVisible()
  const frame = () => page.frames().find(frame => frame.url().includes('/noVNC/vnc_lite.html'))!
  expect(Boolean(await frame().evaluate(() => (window as any).__rfb.viewOnly))).toBe(true)
  await frame().evaluate(() => (window as any).__rfb.loseConnection())
  await expect.poll(() => accessRequests).toBe(2)
  await expect(browser.getByText('Remote browser connected')).toBeVisible()
  expect(Boolean(await frame().evaluate(() => (window as any).__rfb.viewOnly))).toBe(true)
  await page.getByRole('button', { name: 'Take control', exact: true }).click()
  await expect(browser.getByText('Remote browser connected')).toBeVisible()
  await expect.poll(async () => frame() ? Boolean(await frame().evaluate(() => (window as any).__rfb?.viewOnly)) : true).toBe(false)
  // Changing control uses the existing connection; the next outage needs a new grant.
  expect(accessRequests).toBe(2)
  await frame().evaluate(() => (window as any).__rfb.loseConnection())
  await expect.poll(() => accessRequests).toBe(3)
  await expect(browser.getByText('Remote browser connected')).toBeVisible()
  expect(Boolean(await frame().evaluate(() => (window as any).__rfb.viewOnly))).toBe(false)
  await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/browser-recovery.png') })
})

test('outage retries are bounded and hiding the browser cancels recovery', async ({ page }) => {
  let accessRequests = 0
  await page.route('**/noVNC/core/rfb.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    export default class RFB extends EventTarget {
      constructor() {
        super();
        queueMicrotask(() => this.dispatchEvent(new CustomEvent('disconnect', { detail: { clean: false } })));
      }
      disconnect() {}
    }
  ` }))
  await page.route('**/api/preview/access', async route => {
    accessRequests++
    await route.fulfill({ json: { url: '/noVNC/vnc_lite.html?path=preview/test/live/6080/websockify&grant=' + accessRequests } })
  })
  await openFixture(page)
  await expect.poll(() => accessRequests, { timeout: 15000 }).toBe(4)
  await expect(page.getByText('Browser connection interrupted.', { exact: true })).toBeVisible()
  await page.waitForTimeout(4500)
  expect(accessRequests).toBe(4)
  await page.getByRole('button', { name: 'Reconnect browser', exact: true }).click()
  await expect.poll(() => accessRequests).toBe(5)
  await page.getByRole('button', { name: 'Hide browser', exact: true }).click()
  await page.waitForTimeout(1500)
  expect(accessRequests).toBe(5)
})

test('a stopped browser can be restarted from its chat while retaining user control', async ({ page }) => {
  let restarts = 0
  let session = { status: 'stopped', browserId: 'ended-browser', sharedWithAgent: false, url: null as string | null }
  await page.route('**/api/preview/session/ended-chat', route => route.fulfill({ json: { session } }))
  await page.route('**/api/preview/restart', async route => {
    expect(route.request().postDataJSON()).toEqual({ sessionId: 'ended-chat' })
    restarts++
    session = { ...session, status: 'ready', url: '/noVNC/vnc_lite.html?path=api/live-view/6081/websockify' }
    await route.fulfill({ json: { session } })
  })
  await page.route('**/api/preview/access', route => route.fulfill({ json: { url: '/noVNC/vnc_lite.html?path=preview/scoped/live/6081/websockify' } }))
  await openFixture(page, '?mode=chat')
  await expect(page.getByText('No live browser is available for this chat.')).toBeVisible()
  await page.getByLabel('Browser view options', { exact: true }).click()
  await page.getByRole('button', { name: 'Restart browser', exact: true }).click()
  expect(restarts).toBe(1)
  await expect(page.getByRole('button', { name: /^(Share with agent|Take control)$/ })).toHaveText('Share with agent')
  await expect(page.locator('iframe[title="Agent browser"]')).toHaveAttribute('src', /6081/)
})

test('standard noVNC viewers retain their own connection UI', async ({ page }) => {
  await page.route('**/api/preview/access', route => route.fulfill({ json: { url: '/noVNC/vnc.html?path=preview/scoped/live/6080/websockify' } }))
  await page.route('**/noVNC/vnc.html**', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Standard viewer controls</body></html>' }))
  await openFixture(page, '?mode=full')
  await expect(page.frameLocator('iframe').getByText('Standard viewer controls')).toBeVisible()
  await expect(page.getByText('Connecting to browser…', { exact: true })).toHaveCount(0)
})
