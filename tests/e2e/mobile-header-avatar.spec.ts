import { registerTestUser } from './helpers/agent-user'

import { expect, test } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:8000'

async function registerUser(request: Parameters<typeof test>[0]['request']) {
  const username = `e2e-mobile-avatar-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const password = 'supersecret123'

  const response = await registerTestUser(request, API_URL, {
    data: { username, password },
  })
  expect(response.ok()).toBeTruthy()
  const payload = await response.json() as { access_token: string }
  return { token: payload.access_token, username, password }
}

async function loginInBrowser(
  page: Parameters<typeof test>[0]['page'],
  username: string,
  password: string,
) {
  const result = await page.evaluate(async ([gatewayUrl, nextUsername, nextPassword]) => {
    const response = await fetch(`${gatewayUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username: nextUsername, password: nextPassword }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) return { ok: false, status: response.status, payload }
    const token = (payload as { access_token?: string }).access_token
    if (!token) return { ok: false, status: response.status, payload }
    window.localStorage.setItem('jait-auth-token', token)
    window.sessionStorage.setItem('jait-auth-token', token)
    window.localStorage.setItem('token', token)
    return { ok: true }
  }, [API_URL, username, password] as const)
  expect(result.ok).toBe(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
}

test.describe('mobile account avatar geometry', () => {
  test('centers the avatar inside its coarse-pointer touch target', async ({ page, request }, testInfo) => {
    test.setTimeout(90000)
    test.skip(!testInfo.project.name.startsWith('mobile'), 'mobile-only regression test')

    const { token, username, password } = await registerUser(request)

    await page.context().addCookies([{ name: 'jait_token', value: token, url: API_URL, httpOnly: true, sameSite: 'Lax' }])
    await page.addInitScript(([gatewayUrl]) => {
      window.localStorage.setItem('jait-gateway-url', gatewayUrl)
    }, [API_URL] as const)

    await page.goto('/')
    await loginInBrowser(page, username, password)

    const trigger = page.locator('button[aria-label="Account menu"]:visible').first()
    await expect(trigger).toBeVisible({ timeout: 20000 })

    // The compact header uses a 32px-wide, 40px-high control around its 32px
    // avatar. Keep its centering and height aligned with the header spacing
    // regressions rather than the older global 40px minimum-width rule.
    const gaps = await trigger.evaluate((element) => {
      const circle = element.firstElementChild as HTMLElement | null
      if (!circle) return null
      const target = element.getBoundingClientRect()
      const inner = circle.getBoundingClientRect()
      return {
        left: inner.left - target.left,
        right: target.right - inner.right,
        targetWidth: target.width,
        targetHeight: target.height,
        top: inner.top - target.top,
        bottom: target.bottom - inner.bottom,
        circleWidth: inner.width,
      }
    })

    expect(gaps).not.toBeNull()
    expect(gaps!.targetWidth).toBeGreaterThanOrEqual(gaps!.circleWidth)
    expect(gaps!.targetHeight).toBeGreaterThanOrEqual(40)
    expect(gaps!.circleWidth).toBe(32)
    expect(Math.abs(gaps!.top - gaps!.bottom)).toBeLessThanOrEqual(1)
    expect(Math.abs(gaps!.left - gaps!.right)).toBeLessThanOrEqual(1)
  })
})
