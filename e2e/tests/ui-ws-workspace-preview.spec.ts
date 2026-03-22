import { test, expect } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:8000'
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/workspace/jait'
const DOCS_SITE_ROOT = process.env.DOCS_SITE_ROOT || `${WORKSPACE_ROOT}/docs/site`

async function registerUser(request: Parameters<typeof test>[0]['request']) {
  const username = `e2e-ui-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const password = 'supersecret123'

  const response = await request.post(`${API_URL}/auth/register`, {
    data: { username, password },
  })
  expect(response.ok()).toBeTruthy()
  const payload = await response.json() as { access_token: string }
  return { token: payload.access_token, username, password }
}

async function createSession(
  request: Parameters<typeof test>[0]['request'],
  token: string,
  name: string,
) {
  const response = await request.post(`${API_URL}/api/sessions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { name },
  })
  expect(response.ok()).toBeTruthy()
  const payload = await response.json() as { id: string }
  return payload.id
}

test.describe('WS UI reactions for workspace and preview tools', () => {
  test.describe.configure({ mode: 'serial' })

  test('workspace.open and preview.open update the UI, and architecture stays available', async ({ page, request }, testInfo) => {
    test.setTimeout(90000)
    test.skip(testInfo.project.name.startsWith('mobile'), 'desktop toolbar assertions only')

    const { token, username, password } = await registerUser(request)
    const sessionId = await createSession(request, token, 'ws-ui-e2e')

    await page.addInitScript(([gatewayUrl]) => {
      window.localStorage.setItem('jait-gateway-url', gatewayUrl)
    }, [API_URL])

    await page.goto('/')
    const browserLogin = await page.evaluate(async ([gatewayUrl, nextUsername, nextPassword]) => {
      const response = await fetch(`${gatewayUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: nextUsername, password: nextPassword }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        return { ok: false, status: response.status, payload }
      }
      const token = (payload as { access_token?: string }).access_token
      if (!token) return { ok: false, status: response.status, payload }
      window.sessionStorage.setItem('jait-auth-token', token)
      window.localStorage.setItem('token', token)
      return { ok: true, status: response.status }
    }, [API_URL, username, password] as const)
    expect(browserLogin.ok).toBe(true)
    await page.reload()
    await expect(page.getByRole('button', { name: /workspace/i })).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(1000)

    const approveAll = await request.post(`${API_URL}/api/consent/pending/${sessionId}/approve-all`, {
      data: {},
    })
    expect(approveAll.ok()).toBeTruthy()

    const openWorkspace = await request.post(`${API_URL}/api/tools/execute`, {
      data: {
        tool: 'surfaces.start',
        input: {
          type: 'filesystem',
          workspaceRoot: WORKSPACE_ROOT,
        },
        sessionId,
        workspaceRoot: WORKSPACE_ROOT,
      },
    })
    expect(openWorkspace.ok()).toBeTruthy()
    const workspaceBody = await openWorkspace.json() as { ok: boolean }
    expect(workspaceBody.ok).toBe(true)

    await expect(page.getByRole('button', { name: /workspace/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /preview/i })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Architecture', exact: true })).toBeVisible()

    const openPreview = await request.post(`${API_URL}/api/tools/execute`, {
      data: {
        tool: 'preview.open',
        input: {
          command: 'python3 -m http.server 4173 --bind 127.0.0.1',
          target: '4173',
          workspaceRoot: DOCS_SITE_ROOT,
        },
        sessionId,
        workspaceRoot: DOCS_SITE_ROOT,
      },
    })
    expect(openPreview.ok()).toBeTruthy()
    const previewBody = await openPreview.json() as { ok: boolean }
    expect(previewBody.ok).toBe(true)

    await expect(page.getByText('127.0.0.1:4173/')).toBeVisible({ timeout: 20000 })

    const sendArchitecture = await request.post(`${API_URL}/api/tools/execute`, {
      data: {
        tool: 'architecture.generate',
        input: {
          diagram: 'flowchart TD\nA[Gateway] --> B[Web UI]',
        },
        sessionId,
        workspaceRoot: WORKSPACE_ROOT,
      },
    })
    expect(sendArchitecture.ok()).toBeTruthy()
    const architectureBody = await sendArchitecture.json() as { ok: boolean }
    expect(architectureBody.ok).toBe(true)

    await expect(page.getByText('Architecture', { exact: true })).toBeVisible()
    await expect(page.getByTitle('Regenerate diagram')).toBeVisible()

    await request.post(`${API_URL}/api/tools/execute`, {
      data: {
        tool: 'preview.stop',
        input: {},
        sessionId,
        workspaceRoot: DOCS_SITE_ROOT,
      },
    })
  })
})
