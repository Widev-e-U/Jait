import { test, expect } from '@playwright/test'
import path from 'node:path'

const shotsDir = path.resolve(__dirname, '../../.jait/shots')

test('chat browser supports takeover, sign-in interaction, sharing, reload and expired sessions', async ({ page }) => {
  let shared = true
  let expired = false
  let denyShare = false
  const writes: boolean[] = []
  await page.route('**/api/preview/session/chat-fixture', route => route.fulfill({ json: { session: expired ? null : { sessionId: 'chat-fixture', browserId: 'browser-chat-fixture', status: 'ready', url: '/noVNC/vnc_lite.html?path=api/live-view/6080/websockify', sharedWithAgent: shared } } }))
  await page.route('**/api/preview/share', async route => {
    if (denyShare) { await route.fulfill({ status: 403, json: { error: 'denied' } }); return }
    const body = route.request().postDataJSON()
    expect(body.sessionId).toBe('chat-fixture')
    shared = body.sharedWithAgent
    writes.push(shared)
    await route.fulfill({ json: { session: { sharedWithAgent: shared } } })
  })
  await page.route('**/api/preview/access', route => {
    const { source } = route.request().postDataJSON()
    return route.fulfill({ json: { url: source + '&ticket=fixture' } })
  })
  // The VNC transport is isolated here; the real browser card, auth-grant hook,
  // iframe, controller buttons and API flow all run unmocked in the web app.
  await page.route('**/noVNC/vnc_lite.html?**', route => route.fulfill({ contentType: 'text/html', body: '<label>Email<input aria-label="Email"></label><button>Sign in</button><script>window.addEventListener("message", e => { if (e.source === parent && e.data?.type === "jait-vnc-control") document.body.dataset.viewOnly = String(e.data.viewOnly) }); window.parent.postMessage({ type: "jait-vnc-status", status: "connected" }, location.origin)</script>' }))
  await page.goto('/chat-browser-repro.html')
  const frame = page.getByTitle('Agent browser')
  await expect(frame).toBeVisible()
  await expect(frame).toHaveAttribute('src', /view_only=1/)
  await page.getByRole('button', { name: /^(Share with agent|Take control)$/ }).click()
  await expect(page.getByRole('button', { name: /^(Share with agent|Take control)$/ })).toHaveText('Share with agent')
  await expect(frame).toHaveAttribute('src', /view_only=1/)
  await expect(page.frameLocator('iframe[title="Agent browser"]').locator('body')).toHaveAttribute('data-view-only', 'false')
  await page.frameLocator('iframe[title="Agent browser"]').getByRole('textbox', { name: 'Email' }).fill('test@example.com')
  await expect(page.frameLocator('iframe[title="Agent browser"]').getByRole('textbox')).toHaveValue('test@example.com')
  await page.reload()
  await expect(page.getByRole('button', { name: /^(Share with agent|Take control)$/ })).toHaveText('Share with agent')
  await expect(frame).toHaveAttribute('src', /view_only=1/)
  denyShare = true
  await page.getByRole('button', { name: /^(Share with agent|Take control)$/ }).click()
  await expect(page.getByRole('alert')).toContainText('Could not change browser control')
  await expect(page.getByRole('button', { name: /^(Share with agent|Take control)$/ })).toHaveText('Share with agent')
  denyShare = false
  await page.getByRole('button', { name: /^(Share with agent|Take control)$/ }).click()
  await expect(frame).toHaveAttribute('src', /view_only=1/)
  await expect(page.frameLocator('iframe[title="Agent browser"]').locator('body')).toHaveAttribute('data-view-only', 'true')
  expect(writes).toEqual([false, true])
  await page.screenshot({ path: path.join(shotsDir, 'chat-browser-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: path.join(shotsDir, 'chat-browser-mobile.png'), fullPage: true })
  await page.getByRole('button', { name: 'Minimize browser', exact: true }).click()
  await expect(frame).toHaveCount(1)
  await expect(page.getByRole('region', { name: 'Chat browser', exact: true })).toHaveAttribute('data-browser-minimized', 'true')
  expired = true
  await page.getByRole('button', { name: 'Expand browser', exact: true }).click()
  await expect(page.getByText('No live browser is available for this chat.')).toBeVisible()
  await expect(frame).toHaveCount(0)
})


test('one sticky browser follows the conversation and minimizes without reconnecting or changing control', async ({ page }) => {
  let grants = 0
  const shares: unknown[] = []
  await page.route('**/api/preview/session/chat-fixture', route => route.fulfill({ json: { session: { sessionId: 'chat-fixture', browserId: 'browser-chat-fixture', status: 'ready', url: '/noVNC/vnc_lite.html?path=api/live-view/6080/websockify', sharedWithAgent: false } } }))
  await page.route('**/api/preview/access', route => {
    grants++
    const { source } = route.request().postDataJSON()
    return route.fulfill({ json: { url: source + '&ticket=fixture' } })
  })
  await page.route('**/api/preview/share', route => { shares.push(route.request().postDataJSON()); return route.fulfill({ json: { session: { sharedWithAgent: true } } }) })
  await page.route('**/noVNC/vnc_lite.html?**', route => route.fulfill({ contentType: 'text/html', body: '<body style="margin:0;background:#def;height:100vh"><h1>Live browser</h1><input aria-label="Draft"><script>window.parent.postMessage({ type: "jait-vnc-status", status: "connected" }, location.origin)</script>' }))
  await page.goto('/chat-browser-repro.html')
  const panel = page.getByRole('region', { name: 'Chat browser', exact: true })
  const frame = page.getByTitle('Agent browser')
  await expect(frame).toBeVisible()
  await expect(page.getByRole('button', { name: /^(Share with agent|Take control)$/ })).toBeEnabled()
  await page.frameLocator('iframe[title="Agent browser"]').getByRole('textbox', { name: 'Draft' }).fill('Keep this browser session')
  const connectedGrants = grants
  const before = await panel.boundingBox()
  const scroll = page.locator('[data-conversation-scroll]')
  // The panel floats above the transcript rather than taking a row in the
  // column, so the chat is not pushed down: both share the same top edge and
  // the panel overlaps the transcript instead of sitting above it.
  const scrollBox = (await scroll.boundingBox())!
  // The expanded panel is sized from the conversation frame (55% of its height,
  // capped at 480px), so the expectation follows the frame instead of a fixed
  // pixel value that only matched the earlier hard-coded panel size.
  expect(before!.width).toBeGreaterThan(650)
  expect(before!.height).toBeGreaterThan(scrollBox.height * 0.5)
  expect(before!.height).toBeLessThanOrEqual(480)
  expect(scrollBox.y).toBeLessThanOrEqual(before!.y + 1)
  expect(before!.y).toBeLessThan(scrollBox.y + scrollBox.height)
  // The URL, refresh, tools, agent toggle, options and collapse share one header.
  const header = panel.locator('form')
  await expect(header.getByRole('textbox', { name: 'Browser URL' })).toBeVisible()
  await expect(header.getByRole('button', { name: 'Refresh page' })).toBeVisible()
  await expect(header.getByRole('button', { name: /^(Share with agent|Take control)$/ })).toBeVisible()
  await expect(header.getByRole('button', { name: 'Minimize browser' })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Adjust view', exact: true })).toBeHidden()
  await panel.getByLabel('Browser view options', { exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Adjust view', exact: true })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Reconnect browser' })).toBeVisible()
  await panel.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect(panel.getByLabel('View zoom', { exact: true })).toHaveText('120%')
  await panel.getByRole('button', { name: 'Reset view', exact: true }).click()
  await panel.getByLabel('Browser view options', { exact: true }).click()
  await page.getByRole('button', { name: 'Another browser action' }).click()
  await page.getByRole('button', { name: 'Another browser action' }).click()
  await expect(panel).toHaveCount(1)
  await expect(frame).toHaveCount(1)
  await scroll.evaluate(element => { element.scrollTop = 0 })
  await expect.poll(async () => Math.round((await panel.boundingBox())!.y)).toBe(Math.round(before!.y))
  await page.getByRole('button', { name: 'Minimize browser', exact: true }).click()
  await expect(panel).toHaveAttribute('data-browser-minimized', 'true')
  // The shrink is animated, so the final box has to be awaited, not sampled.
  await expect.poll(async () => Math.round((await panel.boundingBox())!.width)).toBe(160)
  await expect.poll(async () => Math.round((await panel.boundingBox())!.height)).toBe(90)
  await expect(panel.getByRole('button')).toHaveCount(1)
  await expect(panel.locator('iframe')).toHaveCount(1)
  await expect(frame).toHaveAttribute('src', /view_only=1/)
  expect(shares).toEqual([])
  await page.screenshot({ path: path.join(shotsDir, 'chat-browser-minimized.png') })
  await page.getByRole('button', { name: 'Another browser action' }).click()
  await expect(panel).toHaveAttribute('data-browser-minimized', 'true')
  await panel.getByRole('button', { name: 'Expand browser', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(panel).toHaveAttribute('data-browser-minimized', 'false')
  await expect(page.frameLocator('iframe[title="Agent browser"]').getByRole('textbox', { name: 'Draft' })).toHaveValue('Keep this browser session')
  expect(grants).toBe(connectedGrants)
  await page.getByRole('button', { name: 'Switch chat' }).click()
  await expect(panel).toHaveCount(0)
  await expect(frame).toHaveCount(0)
  await page.getByRole('button', { name: 'Switch chat' }).click()
  await expect(panel).toHaveCount(1)
  await expect(frame).toHaveCount(1)
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(panel).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('the unified header navigates, refreshes and keeps the same browser through fullscreen', async ({ page }) => {
  let currentUrl = 'https://example.com/login'
  let shared = false
  let reloads = 0
  const session = () => ({ sessionId: 'chat-fixture', browserId: 'browser-chat-fixture', status: 'ready', url: '/noVNC/vnc_lite.html?path=api/live-view/6080/websockify', sharedWithAgent: shared, metrics: { url: currentUrl } })
  await page.route('**/api/preview/session/chat-fixture', route => route.fulfill({ json: { session: session() } }))
  await page.route('**/api/preview/access', route => route.fulfill({ json: { url: route.request().postDataJSON().source + '&ticket=fixture' } }))
  await page.route('**/api/preview/navigate', route => {
    expect(route.request().postDataJSON().sessionId).toBe('chat-fixture')
    currentUrl = route.request().postDataJSON().url
    return route.fulfill({ json: { session: session() } })
  })
  await page.route('**/api/preview/reload', route => { reloads++; return route.fulfill({ json: { session: session() } }) })
  await page.route('**/api/preview/share', route => { shared = route.request().postDataJSON().sharedWithAgent; return route.fulfill({ json: { session: session() } }) })
  await page.route('**/noVNC/vnc_lite.html?**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Example page</h1><script>window.parent.postMessage({type:"jait-vnc-status",status:"connected"},location.origin)</script>' }))
  await page.goto('/chat-browser-repro.html')
  const panel = page.getByRole('region', { name: 'Chat browser', exact: true })
  const url = panel.getByRole('textbox', { name: 'Browser URL' })
  await expect(url).toBeEnabled()
  await url.fill('example.com/docs')
  await url.press('Enter')
  await expect(url).toHaveValue('https://example.com/docs')
  await panel.getByRole('button', { name: 'Refresh page' }).click()
  await expect.poll(() => reloads).toBe(1)
  await page.frameLocator('iframe[title="Agent browser"]').locator('html').evaluate(el => el.setAttribute('data-session-marker', 'same-session'))
  await panel.getByLabel('Browser view options', { exact: true }).click()
  await panel.getByRole('button', { name: 'Enter fullscreen' }).click()
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.hasAttribute('data-browser-panel'))).toBe(true)
  await expect(url).toBeVisible()
  await expect(panel.getByRole('button', { name: /^(Share with agent|Take control)$/ })).toBeVisible()
  await expect(page.frameLocator('iframe[title="Agent browser"]').locator('html')).toHaveAttribute('data-session-marker', 'same-session')
  await panel.getByRole('button', { name: 'Exit fullscreen' }).click()
  await panel.getByLabel('Browser view options', { exact: true }).click()
  await panel.getByRole('button', { name: /^(Share with agent|Take control)$/ }).click()
  await expect(panel.getByRole('button', { name: /^(Share with agent|Take control)$/ })).toHaveText('Take control')
  await expect(url).toHaveAttribute('readonly', '')
  await expect(panel.getByRole('button', { name: 'Refresh page' })).toBeDisabled()
  await panel.getByRole('button', { name: 'Minimize browser' }).click()
  await panel.getByRole('button', { name: 'Expand browser' }).click()
  await expect(panel.getByRole('button', { name: /^(Share with agent|Take control)$/ })).toHaveText('Take control')
})

test('the first browser tool opens the large panel automatically', async ({ page }) => {
  await page.addInitScript(() => Reflect.set(window, '__chatBrowserFixture', { initiallyUnused: true }))
  await page.route('**/api/preview/session/chat-fixture', route => route.fulfill({ json: { session: { status: 'ready', url: '/noVNC/vnc_lite.html?path=api/live-view/6080/websockify', sharedWithAgent: false } } }))
  await page.route('**/api/preview/access', route => route.fulfill({ json: { url: route.request().postDataJSON().source } }))
  await page.route('**/noVNC/vnc_lite.html?**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Example page</h1>' }))
  await page.goto('/chat-browser-repro.html')
  const panel = page.getByRole('region', { name: 'Chat browser', exact: true })
  await expect(panel).toHaveCount(0)
  await page.getByRole('button', { name: 'Open browser', exact: true }).click()
  await expect(panel).toHaveAttribute('data-browser-minimized', 'false')
  await expect.poll(async () => Math.round((await panel.boundingBox())!.width)).toBeGreaterThan(650)
  await expect(page.getByTitle('Agent browser')).toHaveCount(1)
})

test('browser window moves and resizes within chat and restores after filling the panel', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.route('**/api/preview/session/chat-fixture', route => route.fulfill({ json: { session: { status: 'ready', url: '/noVNC/vnc_lite.html?path=api/live-view/6080/websockify', sharedWithAgent: true } } }))
  await page.route('**/api/preview/access', route => route.fulfill({ json: { url: route.request().postDataJSON().source } }))
  await page.route('**/noVNC/vnc_lite.html?**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Browser window</h1>' }))
  await page.goto('/chat-browser-repro.html')
  const panel = page.getByRole('region', { name: 'Chat browser', exact: true })
  await expect(panel).toHaveAttribute('data-browser-controller', 'agent')
  await expect(page.getByTitle('Agent browser')).toBeVisible()
  await page.frameLocator('iframe[title="Agent browser"]').locator('html').evaluate(el => el.setAttribute('data-window-marker', 'same-browser'))
  await panel.evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished)) })
  const initial = (await panel.boundingBox())!
  const resize = (await panel.locator('[data-browser-resize="se"]').boundingBox())!
  await page.mouse.move(resize.x + 4, resize.y + 4)
  await page.mouse.down()
  await page.mouse.move(resize.x - 156, resize.y - 66, { steps: 8 })
  await page.mouse.up()
  await expect.poll(async () => Math.abs((await panel.boundingBox())!.width - (initial.width - 160))).toBeLessThan(2)
  const smaller = (await panel.boundingBox())!
  const handle = (await panel.getByRole('button', { name: 'Move browser', exact: true }).boundingBox())!
  await page.mouse.move(handle.x + 80, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + 140, handle.y + handle.height / 2 + 50, { steps: 8 })
  await page.mouse.up()
  await expect.poll(async () => Math.abs((await panel.boundingBox())!.x - (smaller.x + 60))).toBeLessThan(2)
  const moved = (await panel.boundingBox())!
  await panel.getByRole('button', { name: 'Fill chat panel', exact: true }).click()
  await expect(panel).toHaveAttribute('data-browser-maximized', 'true')
  const parent = await panel.evaluate(el => { const p = el.offsetParent!; const b = p.getBoundingClientRect(); return { width: p.clientWidth, height: p.clientHeight, x: b.x, y: b.y } })
  await expect.poll(async () => Math.round((await panel.boundingBox())!.height)).toBe(parent.height)
  const filled = (await panel.boundingBox())!
  expect(filled.width).toBe(parent.width)
  expect(filled.x).toBe(parent.x)
  expect(filled.y).toBe(parent.y)
  await panel.getByRole('button', { name: 'Restore browser size', exact: true }).click()
  await expect.poll(async () => Math.round((await panel.boundingBox())!.width)).toBe(Math.round(moved.width))
  expect(Math.round((await panel.boundingBox())!.x)).toBe(Math.round(moved.x))
  await expect(page.frameLocator('iframe[title="Agent browser"]').locator('html')).toHaveAttribute('data-window-marker', 'same-browser')
  const border = panel.locator('[data-browser-border]')
  await expect(border).toHaveCSS('border-bottom-width', '2px')
  await expect(border).toHaveCSS('pointer-events', 'none')
  await page.screenshot({ path: path.resolve(shotsDir, 'chat-browser-window.png') })
  await panel.getByRole('button', { name: 'Fill chat panel', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveAttribute('data-browser-maximized', 'false')
})


test('browser can cover the project and composer while staying clear of the sidebar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.route('**/api/preview/session/chat-fixture', route => route.fulfill({ json: { session: { status: 'ready', url: '/noVNC/vnc_lite.html?path=api/live-view/6080/websockify', sharedWithAgent: true } } }))
  await page.route('**/api/preview/access', route => route.fulfill({ json: { url: route.request().postDataJSON().source } }))
  await page.route('**/noVNC/vnc_lite.html?**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Browser window</h1>' }))
  await page.goto('/chat-browser-repro.html?workspace')
  const panel = page.getByRole('region', { name: 'Chat browser', exact: true })
  await expect(page.getByTitle('Agent browser')).toBeVisible()
  await expect(panel.locator('xpath=..')).toHaveAttribute('data-browser-workspace-overlay', 'true')
  await panel.evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished)) })
  const handle = panel.getByRole('button', { name: 'Move browser', exact: true })
  const sidebar = (await page.getByTestId('fixture-sidebar').boundingBox())!
  const project = (await page.getByTestId('fixture-project').boundingBox())!
  const composer = (await page.getByRole('textbox', { name: 'Chat draft' }).boundingBox())!
  const initial = (await panel.boundingBox())!
  const grip = (await handle.boundingBox())!
  await page.mouse.move(grip.x + 50, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x + 50 + sidebar.x + sidebar.width + 20 - initial.x, grip.y + grip.height / 2 + composer.y + composer.height - 20 - (initial.y + initial.height), { steps: 10 })
  await page.mouse.up()
  await expect.poll(async () => (await panel.boundingBox())!.x).toBeLessThan(project.x + project.width / 2)
  await expect.poll(async () => (await panel.boundingBox())!.y + (await panel.boundingBox())!.height).toBeGreaterThan(composer.y)
  const moved = (await panel.boundingBox())!
  expect(moved.x).toBeGreaterThanOrEqual(sidebar.x + sidebar.width)
  const onTop = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-browser-panel]') !== null, {
    x: Math.max(moved.x + 10, composer.x + 10), y: Math.max(moved.y + 35, composer.y + 5),
  })
  expect(onTop).toBe(true)
  expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid="fixture-sidebar"]') !== null, { x: sidebar.x + 10, y: sidebar.y + 40 })).toBe(true)
})

test('returning to a chat recovers its idle browser and control state', async ({ page }) => {
  let stopped = true
  let restarts = 0
  const live = { sessionId: 'chat-fixture', browserId: 'browser-chat-fixture', status: 'ready', origin: 'agent', target: 'https://example.com/page', url: '/noVNC/vnc_lite.html?path=api/live-view/6080/websockify', sharedWithAgent: false }
  await page.route('**/api/preview/session/chat-fixture', route => route.fulfill({ json: { session: stopped ? { ...live, status: 'stopped', url: null } : live } }))
  await page.route('**/api/preview/restart', route => { restarts++; stopped = false; return route.fulfill({ json: { session: live } }) })
  await page.route('**/api/preview/access', route => route.fulfill({ json: { url: route.request().postDataJSON().source } }))
  await page.route('**/noVNC/vnc_lite.html?**', route => route.fulfill({ contentType: 'text/html', body: '<script>parent.postMessage({type:"jait-vnc-status",status:"connected"}, location.origin)</script>' }))
  await page.goto('/chat-browser-repro.html')
  await expect(page.getByTitle('Agent browser')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Share with agent' })).toBeVisible()
  expect(restarts).toBe(1)
  await page.getByRole('button', { name: 'Send user message' }).click()
  await page.getByRole('button', { name: 'Switch chat' }).click()
  await expect(page.getByTitle('Agent browser')).toHaveCount(0)
  await page.getByRole('button', { name: 'Switch chat' }).click()
  await expect(page.getByTitle('Agent browser')).toBeVisible()
  expect(restarts).toBe(1)
})
