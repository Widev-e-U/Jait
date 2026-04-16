import { test, expect } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:8000'

async function registerUser(request: Parameters<typeof test>[0]['request']) {
  const username = `e2e-browser-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const password = 'supersecret123'

  const response = await request.post(`${API_URL}/api/auth/register`, {
    data: { username, password },
  })
  expect(response.ok()).toBeTruthy()
  const payload = await response.json() as { access_token: string }
  return { token: payload.access_token, username, password }
}

test.describe('browser collaboration preview integration', () => {
  test.describe.configure({ mode: 'serial' })

  test('attached collaboration sessions open into the unified preview surface', async ({ page, request }, testInfo) => {
    test.setTimeout(90000)
    test.skip(testInfo.project.name.startsWith('mobile'), 'desktop workspace assertions only')

    const { token, username, password } = await registerUser(request)

    const browserSessionResponse = await request.post(`${API_URL}/api/browser/sessions`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: 'attached-gateway-browser',
        targetUrl: 'http://127.0.0.1:8000/',
        previewUrl: '/api/dev-proxy/8000/',
        previewSessionId: 'preview-attached-gateway',
        browserId: 'browser-attached-gateway',
        mode: 'shared',
        origin: 'attached',
        controller: 'agent',
        status: 'ready',
      },
    })
    expect(browserSessionResponse.ok()).toBeTruthy()

    const interventionResponse = await request.post(`${API_URL}/api/browser/interventions`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        browserSessionId: (await browserSessionResponse.json() as { session: { id: string } }).session.id,
        reason: 'Confirm preview routing',
        instructions: 'Open the live session in the preview surface.',
        allowUserNote: true,
      },
    })
    expect(interventionResponse.ok()).toBeTruthy()

    await page.addInitScript(([gatewayUrl]) => {
      window.localStorage.setItem('jait-gateway-url', gatewayUrl)
    }, [API_URL])

    await page.goto('/')
    const browserLogin = await page.evaluate(async ([gatewayUrl, nextUsername, nextPassword]) => {
      const response = await fetch(`${gatewayUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: nextUsername, password: nextPassword }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) return { ok: false, status: response.status, payload }
      const token = (payload as { access_token?: string }).access_token
      if (!token) return { ok: false, status: response.status, payload }
      window.sessionStorage.setItem('jait-auth-token', token)
      window.localStorage.setItem('token', token)
      return { ok: true, status: response.status }
    }, [API_URL, username, password] as const)
    expect(browserLogin.ok).toBe(true)
    await page.reload()

    await expect(page.getByText('Browser Collaboration')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Confirm preview routing')).toBeVisible()

    await page.getByRole('button', { name: 'Open live session' }).first().click()

    await expect(page.getByText('/api/dev-proxy/8000/').first()).toBeVisible({ timeout: 20000 })
  })
})
