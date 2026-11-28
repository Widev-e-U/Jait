import { registerTestUser } from './helpers/agent-user'
import { test, expect } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://127.0.0.1:8100'

test('Tauri titlebar reserves space above chat and keeps window controls clickable', async ({ page, request }) => {
  test.setTimeout(90_000)
  const registration = await registerTestUser(request, API_URL, { data: {
    username: `titlebar-${Date.now()}`, password: 'titlebar-test-password',
  } })
  expect(registration.ok()).toBeTruthy()
  const { access_token: token } = await registration.json()
  const response = await request.post(`${API_URL}/api/sessions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: 'Release checklist' },
  })
  expect(response.ok()).toBeTruthy()
  const session = await response.json() as { id: string }
  await page.route(`**/api/sessions/${session.id}/messages*`, route => route.fulfill({ json: {
    messages: [
      { id: 'user-fixture', role: 'user', content: 'What should we review before shipping the desktop update?' },
      { id: 'assistant-fixture', role: 'assistant', content: 'Check the release notes, install the update, and confirm that dragging and the window controls work.' },
    ],
    streaming: false,
    total: 2,
    hasMore: false,
    seq: 0,
  } }))
  await page.context().addCookies([{ name: 'jait_token', value: token, url: API_URL, httpOnly: true, sameSite: 'Lax' }])
  await page.addInitScript(({ token, api }) => {
    localStorage.setItem('jait-auth-token', token)
    sessionStorage.setItem('jait-auth-token', token)
    localStorage.setItem('token', token)
    localStorage.setItem('jait-gateway-url', api)
    const calls: string[] = []
    let maximized = false
    let onMaximizedChange: ((event: unknown, maximized: boolean) => void) | undefined
    Object.assign(window, {
      __windowCalls: calls,
      jaitDesktop: {
        onScreenShareStart: () => () => {},
        onScreenShareStop: () => () => {},
        onGatewayEvent: () => () => {},
        removeGatewayEventListener: () => {},
        getSetting: async (key: string) => key === 'jait-device-name' ? 'Test desktop' : true,
        setSetting: async () => {},
        gatewayUrl: api,
        getInfo: async () => ({ platform: 'win32', gatewayUrl: api }),
        windowIsMaximized: async () => maximized,
        onMaximizedChange: (listener: typeof onMaximizedChange) => {
          onMaximizedChange = listener
          return () => { onMaximizedChange = undefined }
        },
        windowMinimize: () => calls.push('minimize'),
        windowMaximize: () => {
          calls.push(maximized ? 'restore' : 'maximize')
          maximized = !maximized
          onMaximizedChange?.(undefined, maximized)
        },
        windowClose: () => calls.push('close'),
        windowStartDrag: async () => { calls.push('drag') },
      },
    })
  }, { token, api: API_URL })
  await page.addLocatorHandler(page.getByText('A node needs your permission', { exact: true }), async () => {
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click()
  })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto(`/chat?sessionId=${session.id}`, { waitUntil: 'domcontentloaded' })
  const titlebar = page.locator('[data-desktop-titlebar]')
  const workspace = page.locator('[data-browser-workspace]')
  await expect(titlebar).toBeVisible()
  await expect(workspace.getByText('What should we review before shipping the desktop update?')).toBeVisible()
  await titlebar.getByRole('button', { name: 'Minimize', exact: true }).click({ trial: true })
  await expect(titlebar).toHaveText('')
  const barBounds = (await titlebar.boundingBox())!
  expect(barBounds).toMatchObject({ y: 0, height: 44 })
  expect((await workspace.boundingBox())?.y).toBe(barBounds.y + barBounds.height)
  expect(await titlebar.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)')

  // This point is below the old 16 px strip and over the expanded drag area.
  expect(await page.evaluate(() => document.elementFromPoint(200, 30)?.hasAttribute('data-tauri-drag-region'))).toBe(true)
  await page.mouse.click(200, 30, { button: 'right' })
  expect(await page.evaluate(() => (window as any).__windowCalls)).toEqual([])
  await page.mouse.move(200, 30)
  await page.mouse.down()
  await page.mouse.move(260, 65)
  await page.mouse.up()
  expect(await page.evaluate(() => (window as any).__windowCalls)).toEqual(['drag'])

  for (const name of ['Minimize', 'Maximize', 'Restore', 'Close']) {
    await titlebar.getByRole('button', { name, exact: true }).click()
  }
  expect(await page.evaluate(() => (window as any).__windowCalls)).toEqual(['drag', 'minimize', 'maximize', 'restore', 'close'])

  await page.goto('/agents', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'New agent', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible()
})
