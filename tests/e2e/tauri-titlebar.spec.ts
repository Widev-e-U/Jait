import { test, expect } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://127.0.0.1:8100'

test('Tauri titlebar overlays content without a gap and preserves window controls', async ({ page, request }) => {
  test.setTimeout(90_000)
  const registration = await request.post(`${API_URL}/api/auth/register`, { data: {
    username: `titlebar-${Date.now()}`, password: 'titlebar-test-password',
  } })
  expect(registration.ok()).toBeTruthy()
  const { access_token: token } = await registration.json()
  await page.addInitScript(({ token, api }) => {
    localStorage.setItem('jait-auth-token', token)
    sessionStorage.setItem('jait-auth-token', token)
    localStorage.setItem('token', token)
    localStorage.setItem('jait-gateway-url', api)
    const calls: string[] = []
    Object.assign(window, {
      __windowCalls: calls,
      jaitDesktop: {
        onScreenShareStart: () => () => {},
        onScreenShareStop: () => () => {},
        onGatewayEvent: () => () => {},
        removeGatewayEventListener: () => {},
        getSetting: async () => true,
        setSetting: async () => {},
        gatewayUrl: api,
        getInfo: async () => ({ platform: 'win32', gatewayUrl: api }),
        windowIsMaximized: async () => false,
        onMaximizedChange: () => () => {},
        windowMinimize: () => calls.push('minimize'),
        windowMaximize: () => calls.push('maximize'),
        windowClose: () => calls.push('close'),
      },
    })
  }, { token, api: API_URL })
  await page.addLocatorHandler(page.getByText('A node needs your permission', { exact: true }), async () => {
    await page.getByRole('button', { name: 'Dismiss', exact: true }).click()
  })
  await page.goto('/agents', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Minimize', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New agent', exact: true })).toBeVisible()
  expect((await page.locator('main').boundingBox())?.y).toBe(0)
  const drag = page.locator('[data-tauri-drag-region]').first()
  expect(await drag.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
  expect(await page.evaluate(() => document.elementFromPoint(200, 4)?.hasAttribute('data-tauri-drag-region'))).toBe(true)
  for (const name of ['Minimize', 'Maximize', 'Close']) {
    await page.getByRole('button', { name, exact: true }).click()
  }
  expect(await page.evaluate(() => (window as any).__windowCalls)).toEqual(['minimize', 'maximize', 'close'])
  await page.getByRole('button', { name: 'New agent', exact: true }).click()
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toBeVisible()
})
