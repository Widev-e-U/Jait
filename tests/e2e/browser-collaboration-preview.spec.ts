import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { test, expect, type APIRequestContext } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:8000'
const PROJECT_ROOT = process.env.PROJECT_ROOT || resolve(process.cwd(), '../..')

async function createSession(request: APIRequestContext) {
  const username = `e2e-browser-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const password = 'supersecret123'

  const registerResponse = await request.post(`${API_URL}/api/auth/register`, {
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
  test('browser tools automatically target the visible preview browser', async ({ request }) => {
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
      response.end('<title>Preview collaboration</title><h1>Shared preview</h1>')
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
