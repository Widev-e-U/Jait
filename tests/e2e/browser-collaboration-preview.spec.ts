import { registerTestUser } from './helpers/agent-user'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { test, expect, type APIRequestContext } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:8000'
const PROJECT_ROOT = process.env.PROJECT_ROOT || resolve(__dirname, '../..')
const SHOTS_DIR = resolve(__dirname, '../../.jait/shots')

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
    page.setDefaultTimeout(15000)
    // Chromium's Network table virtualizes its rows; give the embedded tools
    // enough height for the toolbar, overview, and request table.
    await page.setViewportSize({ width: 1280, height: 1080 })
    const { id: sessionId, token } = await createSession(request)

    const approveAll = await request.post(`${API_URL}/api/consent/pending/${sessionId}/approve-all`, {
      data: {},
    })
    expect(approveAll.ok()).toBeTruthy()

    // Use a small page so this browser collaboration test does not also compile
    // the entire Jait web app inside Playwright's memory-limited dev stack.
    let pageLoads = 0
    const pageServer = createServer((_request, response) => {
      if (_request.url !== '/favicon.ico') pageLoads++
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end(`<style>html { background: rgb(226,245,245); }</style><title>Preview collaboration</title><h1>Shared preview</h1><input aria-label="Collaboration note" autofocus oninput="document.getElementById('typed').textContent=this.value"><output id="typed"></output><script>console.log('Browser tools ready')</script>`)
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

      // Agent-initiated previews start shared; exercise the user's takeover
      // before asserting that browser tools cannot access an unshared preview.
      const takeoverResponse = await request.post(`${API_URL}/api/preview/share`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { sessionId, sharedWithAgent: false },
      })
      expect(takeoverResponse.ok()).toBeTruthy()

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
      // The page reaches the top-left corner of the actual desktop stream.
      // A native title bar or Chrome toolbar would occupy this pixel.
      await expect.poll(() => canvas.evaluate(element => {
        const pixel = (element as HTMLCanvasElement).getContext('2d')?.getImageData(2, 2, 1, 1).data
        return !!pixel && Math.abs(pixel[0] - 226) < 5 && Math.abs(pixel[1] - 245) < 5 && Math.abs(pixel[2] - 245) < 5
      })).toBe(true)
      await expect(page.getByRole('textbox', { name: 'Browser URL' })).toHaveValue(previewTarget)
      await expect(page.getByRole('textbox', { name: 'Browser URL' })).toHaveAttribute('readonly', '')
      await expect(page.getByRole('button', { name: 'Refresh page', exact: true })).toBeDisabled()
      await expect(viewer).toHaveAttribute('src', /view_only=1/)
      await page.getByRole('button', { name: 'Take control', exact: true }).click()
      await expect(page.getByRole('button', { name: 'Share with agent', exact: true })).toBeEnabled()
      await expect(viewer).not.toHaveAttribute('src', /view_only=1/)
      await expect(canvas).toBeVisible()
      // Taking control enables page input immediately. The local fixture
      // focuses this field; key input travels through VNC.
      await expect(page.frameLocator('iframe[title="Agent browser"]').locator('#status')).toHaveText(/Connected to/)
      await canvas.focus()
      await page.keyboard.type('live-browser-takeover')
      await page.reload()
      await expect(page.getByRole('button', { name: 'Share with agent', exact: true })).toBeEnabled()
      await expect(viewer).not.toHaveAttribute('src', /view_only=1/)
      await expect.poll(hasDesktopPixels).toBe(true)
      await mkdir(SHOTS_DIR, { recursive: true })
      await page.screenshot({ path: resolve(SHOTS_DIR, 'compact-browser-takeover.png') })
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
      const addressBar = page.getByRole('textbox', { name: 'Browser URL' })
      await expect(addressBar).not.toHaveAttribute('readonly', '')
      const nextUrl = `${previewTarget}?navigated=1`
      await addressBar.fill(nextUrl)
      await page.getByRole('button', { name: 'Go to URL', exact: true }).click()
      await expect(addressBar).toHaveValue(nextUrl)
      await expect(addressBar).toHaveAttribute('aria-busy', 'false')
      const afterNavigation = await request.get(`${API_URL}/api/preview/session/${sessionId}`, { headers: { Authorization: `Bearer ${token}` } })
      const { session: navigated } = await afterNavigation.json()
      expect(navigated.browserId).toBe(preview.data?.browserId)
      expect(navigated.sharedWithAgent).toBe(false)
      expect(navigated.metrics.url).toBe(nextUrl)
      // Refresh uses the actual current page, ignoring an unsubmitted draft.
      const loadsBefore = pageLoads
      await addressBar.fill('https://unsubmitted.invalid/')
      await page.getByRole('button', { name: 'Refresh page', exact: true }).click()
      await expect(addressBar).toHaveAttribute('aria-busy', 'false')
      await expect.poll(() => pageLoads).toBeGreaterThan(loadsBefore)
      await expect(addressBar).toHaveValue(nextUrl)
      await page.getByRole('button', { name: 'Browser tools', exact: true }).click()
      const tools = page.getByRole('region', { name: 'Browser tools', exact: true })
      const devtools = page.frameLocator('iframe[title="Chrome DevTools"]')
      await expect(devtools.getByRole('tab', { name: 'Elements', exact: true })).toBeVisible()
      await expect(devtools.locator('body')).toContainText('Shared preview')
      await devtools.getByRole('tab', { name: 'Console', exact: true }).click()
      await expect(devtools.locator('body')).toContainText('Browser tools ready')
      await devtools.getByRole('navigation', { name: 'Main toolbar' }).getByRole('button', { name: 'More tabs' }).click()
      await devtools.getByRole('menuitem', { name: 'Network', exact: true }).click()
      await devtools.getByRole('button', { name: 'Network settings', exact: true }).click()
      await devtools.locator('input[type="checkbox"][name="Overview"]').uncheck()
      await devtools.getByRole('button', { name: 'Network settings', exact: true }).click()
      await page.getByRole('button', { name: 'Refresh page', exact: true }).click()
      await expect(addressBar).toHaveAttribute('aria-busy', 'false')
      await expect(devtools.locator('body')).toContainText(/requests/)
      const networkRow = devtools.locator('tr.data-grid-data-grid-node').filter({ hasText: '?navigated=1' })
      await expect(networkRow.locator('td.status-column')).toContainText('200')
      const viewerBox = await viewer.boundingBox()
      const toolsBox = await tools.boundingBox()
      expect(viewerBox).not.toBeNull()
      expect(toolsBox).not.toBeNull()
      expect(toolsBox!.x).toBeGreaterThanOrEqual(viewerBox!.x + viewerBox!.width - 1)
      expect(Math.abs(toolsBox!.y - viewerBox!.y)).toBeLessThan(2)
      expect(Math.abs(toolsBox!.height - viewerBox!.height)).toBeLessThan(2)
      await page.screenshot({ path: resolve(SHOTS_DIR, 'chrome-devtools-right.png') })
      await page.getByRole('button', { name: 'Share with agent', exact: true }).click()
      await expect(page.locator('iframe[title="Chrome DevTools"]')).toHaveCount(0)
      await page.getByRole('button', { name: 'Take control', exact: true }).click()
      await expect(devtools.getByRole('tab', { name: 'Network', exact: true })).toBeVisible()
      await page.getByRole('button', { name: 'Browser tools', exact: true }).click()
      await page.screenshot({ path: resolve(SHOTS_DIR, 'compact-browser-controls.png') })
      const blockedAgain = await request.post(`${API_URL}/api/tools/execute`, {
        data: { tool: 'browser.inspect', input: {}, sessionId, projectRoot: PROJECT_ROOT },
      })
      expect((await blockedAgain.json() as { ok: boolean }).ok).toBe(false)
    } finally {
      await page.close()
      try {
        await request.post(`${API_URL}/api/tools/execute`, {
          timeout: 10000,
          data: {
            tool: 'preview.stop',
            input: {},
            sessionId,
            projectRoot: PROJECT_ROOT,
          },
        })
      } finally {
        pageServer.closeAllConnections()
        await new Promise<void>((resolveClose) => pageServer.close(() => resolveClose()))
      }
    }
  })
})
