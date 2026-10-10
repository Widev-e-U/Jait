import { registerTestUser } from './helpers/agent-user'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { test, expect, type APIRequestContext } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:8000'
const PROJECT_ROOT = process.env.PROJECT_ROOT || resolve(process.cwd(), '../..')

async function createSession(request: APIRequestContext) {
  const username = `e2e-browser-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const password = 'supersecret123'

  const registerResponse = await registerTestUser(request, API_URL, {
    data: { username, password },
  })
  expect(registerResponse.ok()).toBeTruthy()
  const { access_token: token } = await registerResponse.json() as { access_token: string }

  const sessionResponse = await request.post(`${API_URL}/api/sessions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name: 'browser-preview-e2e' },
  })
  expect(sessionResponse.ok()).toBeTruthy()
  const { id } = await sessionResponse.json() as { id: string }
  return { id, token }
}

test.describe('browser and preview integration', () => {
  test('browser tools automatically target the visible preview browser', async ({ request, page, context }) => {
    test.setTimeout(90000)
    const { id: sessionId, token } = await createSession(request)

    const approveAll = await request.post(`${API_URL}/api/consent/pending/${sessionId}/approve-all`, {
      data: {},
    })
    expect(approveAll.ok()).toBeTruthy()

    // Use a small page so this browser collaboration test does not also compile
    // the entire Jait web app inside Playwright's memory-limited dev stack.
    const pageServer = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end(`<title>Preview collaboration</title><h1>Shared preview</h1><input aria-label="Collaboration note" autofocus oninput="document.getElementById('typed').textContent=this.value"><output id="typed"></output>`)
    })
    await new Promise<void>((resolveListen) => pageServer.listen(0, '0.0.0.0', resolveListen))
    const address = pageServer.address()
    if (!address || typeof address === 'string') throw new Error('Preview test server did not bind a port')
    const previewTarget = `http://127.0.0.1:${address.port}/`

    try {
      const previewResponse = await request.post(`${API_URL}/api/tools/execute`, {
        data: {
          tool: 'preview.open',
          input: {
            target: previewTarget,
            projectRoot: PROJECT_ROOT,
          },
          sessionId,
          projectRoot: PROJECT_ROOT,
        },
      })
      expect(previewResponse.ok()).toBeTruthy()
      const preview = await previewResponse.json() as {
        ok: boolean
        data?: { browserId?: string; url?: string }
      }
      expect(preview.ok).toBe(true)
      expect(preview.data?.browserId).toBe(`preview-browser-${sessionId}`)

      const blockedResponse = await request.post(`${API_URL}/api/tools/execute`, {
        data: { tool: 'browser.inspect', input: {}, sessionId, projectRoot: PROJECT_ROOT },
      })
      expect((await blockedResponse.json() as { ok: boolean }).ok).toBe(false)

      const shareResponse = await request.post(`${API_URL}/api/preview/share`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { sessionId, sharedWithAgent: true },
      })
      expect(shareResponse.ok()).toBeTruthy()

      const inspectResponse = await request.post(`${API_URL}/api/tools/execute`, {
        data: {
          tool: 'browser.inspect',
          input: {},
          sessionId,
          projectRoot: PROJECT_ROOT,
        },
      })
      expect(inspectResponse.ok()).toBeTruthy()
      const inspection = await inspectResponse.json() as {
        ok: boolean
        data?: { browserId?: string; url?: string }
      }
      expect(inspection.ok).toBe(true)
      expect(inspection.data?.browserId).toBe(preview.data?.browserId)
      expect(inspection.data?.url).toContain(new URL(previewTarget).host)

      // Exercise the real authenticated noVNC transport inside the chat card.
      // Only the persisted tool result is injected; API, grants and VNC are live.
      await context.addCookies([{ name: 'jait_token', value: token, url: API_URL, httpOnly: true, sameSite: 'Lax' }])
      await page.addInitScript(({ sessionId, data, apiUrl }) => {
        localStorage.setItem('jait-gateway-url', apiUrl)
        Reflect.set(window, '__chatBrowserFixture', {
          sessionId,
          call: { callId: 'live-preview', startedAt: Date.now(), tool: 'preview.open', args: {}, status: 'success', result: { ok: true, data } },
        })
      }, { sessionId, apiUrl: API_URL, data: { ...preview.data, sessionId, sharedWithAgent: true } })
      await page.goto('/chat-browser-repro.html')
      const viewer = page.locator('iframe[title="Agent browser"]')
      await expect(viewer).toBeVisible()
      await expect(page.getByRole('button', { name: 'Take control', exact: true })).toBeEnabled()
      const canvas = page.frameLocator('iframe[title="Agent browser"]').locator('canvas')
      const hasDesktopPixels = () => canvas.evaluate(element => {
        const canvas = element as HTMLCanvasElement
        if (!canvas.width || !canvas.height) return false
        const pixels = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data
        return !!pixels?.some((value, index) => index % 4 !== 3 && value > 20)
      })
      await expect.poll(hasDesktopPixels).toBe(true)
      await expect(viewer).toHaveAttribute('src', /view_only=1/)
      await page.getByRole('button', { name: 'Take control', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Share with agent', exact: true })).toBeEnabled()
      await expect(viewer).not.toHaveAttribute('src', /view_only=1/)
      await expect(canvas).toBeVisible()
      await page.getByRole('button', { name: '🔍 Navigate', exact: true }).click()
      // The local fixture focuses this field; key input travels through VNC.
      await expect(page.frameLocator('iframe[title="Agent browser"]').locator('#status')).toHaveText(/Connected to/)
      await canvas.focus()
      await page.keyboard.type('live-browser-takeover')
      await page.reload()
      await expect(page.getByRole('button', { name: 'Share with agent', exact: true })).toBeEnabled()
      await expect(viewer).not.toHaveAttribute('src', /view_only=1/)
      await expect.poll(hasDesktopPixels).toBe(true)
      await page.screenshot({ path: 'test-results/live-browser-takeover.png' })
      await page.getByRole('button', { name: 'Share with agent', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Take control', exact: true })).toBeEnabled()
      const typedResponse = await request.post(`${API_URL}/api/tools/execute`, {
        data: { tool: 'browser.inspect', input: {}, sessionId, projectRoot: PROJECT_ROOT },
      })
      expect(JSON.stringify(await typedResponse.json())).toContain('live-browser-takeover')

      const unshareResponse = await request.post(`${API_URL}/api/preview/share`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { sessionId, sharedWithAgent: false },
      })
      expect(unshareResponse.ok()).toBeTruthy()
      const blockedAgain = await request.post(`${API_URL}/api/tools/execute`, {
        data: { tool: 'browser.inspect', input: {}, sessionId, projectRoot: PROJECT_ROOT },
      })
      expect((await blockedAgain.json() as { ok: boolean }).ok).toBe(false)
    } finally {
      await request.post(`${API_URL}/api/tools/execute`, {
        data: {
          tool: 'preview.stop',
          input: {},
          sessionId,
          projectRoot: PROJECT_ROOT,
        },
      })
      await new Promise<void>((resolveClose) => pageServer.close(() => resolveClose()))
    }
  })
})
