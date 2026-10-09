import { test, expect } from '@playwright/test'

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
  await page.route('**/noVNC/vnc_lite.html?**', route => route.fulfill({ contentType: 'text/html', body: '<label>Email<input aria-label="Email"></label><button>Sign in</button>' }))
  await page.goto('/chat-browser-repro.html')
  const frame = page.getByTitle('Agent browser')
  await expect(frame).toBeVisible()
  await expect(frame).toHaveAttribute('src', /view_only=1/)
  await page.getByRole('button', { name: 'Take control', exact: true }).click()
  await expect(page.getByText('You are controlling', { exact: true })).toBeVisible()
  await expect(frame).not.toHaveAttribute('src', /view_only=/)
  await page.frameLocator('iframe[title="Agent browser"]').getByRole('textbox', { name: 'Email' }).fill('test@example.com')
  await expect(page.frameLocator('iframe[title="Agent browser"]').getByRole('textbox')).toHaveValue('test@example.com')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Share with agent', exact: true })).toBeVisible()
  await expect(frame).not.toHaveAttribute('src', /view_only=/)
  denyShare = true
  await page.getByRole('button', { name: 'Share with agent', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Could not change browser control')
  await expect(page.getByText('You are controlling', { exact: true })).toBeVisible()
  denyShare = false
  await page.getByRole('button', { name: 'Share with agent', exact: true }).click()
  await expect(frame).toHaveAttribute('src', /view_only=1/)
  expect(writes).toEqual([false, true])
  await page.screenshot({ path: '../../.jait/chat-browser-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: '../../.jait/chat-browser-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Hide browser', exact: true }).click()
  await expect(frame).toHaveCount(0)
  expired = true
  await page.getByRole('button', { name: 'Show browser', exact: true }).click()
  await expect(page.getByText('No live browser is available for this chat.')).toBeVisible()
  await expect(frame).toHaveCount(0)
})
