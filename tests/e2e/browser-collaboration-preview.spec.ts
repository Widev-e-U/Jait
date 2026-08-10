import { resolve } from 'node:path'
import { test, expect, type APIRequestContext } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:8000'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'
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
  return id
}

test.describe('browser and preview integration', () => {
  test('browser tools automatically target the visible preview browser', async ({ request }) => {
    test.setTimeout(90000)
    const sessionId = await createSession(request)

    const approveAll = await request.post(`${API_URL}/api/consent/pending/${sessionId}/approve-all`, {
      data: {},
    })
    expect(approveAll.ok()).toBeTruthy()

    try {
      const previewResponse = await request.post(`${API_URL}/api/tools/execute`, {
        data: {
          tool: 'preview.open',
          input: {
            target: FRONTEND_URL,
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
      expect(inspection.data?.url).toContain(new URL(FRONTEND_URL).host)
    } finally {
      await request.post(`${API_URL}/api/tools/execute`, {
        data: {
          tool: 'preview.stop',
          input: {},
          sessionId,
          projectRoot: PROJECT_ROOT,
        },
      })
    }
  })
})
