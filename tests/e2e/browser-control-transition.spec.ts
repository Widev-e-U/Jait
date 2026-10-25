import { test, expect } from '@playwright/test'
import path from 'node:path'

const viewerRoot = path.resolve(__dirname, '../../apps/web/public/noVNC')
const shots = path.resolve(__dirname, '../../.jait/shots')

test.use({ hasTouch: true })

for (const width of [390, 1100]) {
  test(`control switches keep the live browser mounted at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    let shared = true
    let denied = false
    let finishShare: (() => void) | undefined
    let grants = 0
    let viewerLoads = 0
    const session = () => ({ sessionId: 'chat-fixture', status: 'ready', url: '/noVNC/vnc_lite.html?path=api/live-view/6080/websockify', sharedWithAgent: shared })
    await page.route('**/api/preview/session/chat-fixture', route => route.fulfill({ json: { session: session() } }))
    await page.route('**/api/preview/share', async route => {
      await new Promise<void>(resolve => { finishShare = resolve })
      if (denied) return route.fulfill({ status: 403, json: { error: 'denied' } })
      shared = route.request().postDataJSON().sharedWithAgent
      return route.fulfill({ json: { session: session() } })
    })
    await page.route('**/api/preview/access', route => {
      grants++
      return route.fulfill({ json: { url: route.request().postDataJSON().source } })
    })
    await page.route('**/noVNC/**', route => {
      if (new URL(route.request().url()).pathname.endsWith('vnc_lite.html')) viewerLoads++
      return route.fulfill({ path: path.join(viewerRoot, new URL(route.request().url()).pathname.slice('/noVNC/'.length)) })
    })
    // Keep the shipping viewer, messages and mobile controls; stub only the transport.
    await page.route('**/noVNC/core/rfb.js', route => route.fulfill({ contentType: 'text/javascript', body: `
      export default class RFB extends EventTarget {
        constructor(screen) {
          super(); window.testRfb = this; window.sentKeys = [];
          screen.innerHTML = '<canvas tabindex="0" aria-label="Remote screen"></canvas><input aria-label="Persistent page field">';
          queueMicrotask(() => this.dispatchEvent(new Event('connect')));
        }
        sendKey(keysym) { if (!this.viewOnly) window.sentKeys.push(keysym); }
      }
    ` }))
    await page.goto('/chat-browser-repro.html')
    const panel = page.getByRole('region', { name: 'Chat browser', exact: true })
    const iframe = panel.getByTitle('Agent browser')
    const frame = page.frameLocator('iframe[title="Agent browser"]')
    const remoteMode = () => frame.locator('body').evaluate(() => Reflect.get(window, 'testRfb').viewOnly)
    const take = panel.getByRole('button', { name: 'Take control', exact: true })
    await expect(take).toBeEnabled()
    await expect.poll(remoteMode).toBe(true)
    await expect(panel).toHaveClass(/border-blue-500/)
    await expect(take).toHaveClass(/border-blue-500/)
    const originalSource = await iframe.getAttribute('src')
    await frame.getByLabel('Persistent page field').fill('Keep this page state')

    await take.click()
    await expect(take).toHaveAttribute('aria-busy', 'true')
    await expect(take).toBeDisabled()
    await expect(take.locator('.animate-spin')).toBeVisible()
    await expect(panel.getByText('Connecting to browser…')).toHaveCount(0)
    await expect.poll(() => !!finishShare).toBe(true)
    finishShare!(); finishShare = undefined
    const share = panel.getByRole('button', { name: 'Share with agent', exact: true })
    await expect(share).toBeEnabled()
    await expect.poll(remoteMode).toBe(false)
    await expect(panel).not.toHaveClass(/border-blue-500/)
    await expect(share).not.toHaveClass(/border-blue-500/)
    await expect(frame.getByRole('button', { name: 'Toggle keyboard' })).toBeVisible()
    await expect(frame.getByRole('button', { name: 'Toggle mouse mode' })).toBeVisible()

    // A spoofed origin or a message from within the viewer cannot alter control.
    await page.evaluate(() => {
      const viewer = document.querySelector('iframe')!
      viewer.contentWindow!.dispatchEvent(new MessageEvent('message', { source: window, origin: 'https://unrelated.test', data: { type: 'jait-vnc-control', viewOnly: true } }))
    })
    await frame.locator('body').evaluate(() => window.postMessage({ type: 'jait-vnc-control', viewOnly: true }, location.origin))
    await expect.poll(remoteMode).toBe(false)

    denied = true
    await share.click()
    await expect(share).toHaveAttribute('aria-busy', 'true')
    await expect.poll(() => !!finishShare).toBe(true)
    finishShare!(); finishShare = undefined
    await expect(panel.getByRole('alert')).toContainText('Could not change browser control')
    await expect(share).toBeEnabled()
    await expect.poll(remoteMode).toBe(false)
    await expect(panel).not.toHaveClass(/border-blue-500/)

    denied = false
    await frame.getByRole('button', { name: 'Toggle keyboard' }).tap()
    await share.click()
    await expect.poll(() => !!finishShare).toBe(true)
    finishShare!()
    await expect(take).toBeEnabled()
    await expect.poll(remoteMode).toBe(true)
    await expect(panel).toHaveClass(/border-blue-500/)
    await expect(take).toHaveClass(/border-blue-500/)
    await expect(frame.getByRole('button', { name: 'Toggle keyboard' })).toBeHidden()
    await expect(frame.getByRole('button', { name: 'Toggle mouse mode' })).toBeHidden()
    await expect(iframe).toHaveAttribute('src', originalSource!)
    await expect(frame.getByLabel('Persistent page field')).toHaveValue('Keep this page state')
    expect(grants).toBe(1)
    expect(viewerLoads).toBe(1)
    await page.screenshot({ path: path.join(shots, `browser-control-agent-${width}.png`) })
    await panel.getByRole('button', { name: 'Minimize browser' }).click()
    await expect(panel).toHaveClass(/border-blue-500/)
  })
}
