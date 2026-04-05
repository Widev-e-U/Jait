import path from 'node:path'

import { expect, test } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:8000'
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.resolve(process.cwd(), '..')

async function registerUser(request: Parameters<typeof test>[0]['request']) {
  const username = `e2e-mobile-header-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const password = 'supersecret123'

  const response = await request.post(`${API_URL}/api/auth/register`, {
    data: { username, password },
  })
  expect(response.ok()).toBeTruthy()
  const payload = await response.json() as { access_token: string }
  return { token: payload.access_token, username, password }
}

async function createWorkspaceAndSession(
  request: Parameters<typeof test>[0]['request'],
  token: string,
) {
  const headers = { Authorization: `Bearer ${token}` }

  const workspaceResponse = await request.post(`${API_URL}/api/workspaces`, {
    headers,
    data: { rootPath: WORKSPACE_ROOT, nodeId: 'gateway', title: 'Mobile header regression' },
  })
  expect(workspaceResponse.ok()).toBeTruthy()
  const workspace = await workspaceResponse.json() as { id: string }

  const sessionResponse = await request.post(`${API_URL}/api/workspaces/${workspace.id}/sessions`, {
    headers,
    data: { name: 'mobile header regression' },
  })
  expect(sessionResponse.ok()).toBeTruthy()
  const session = await sessionResponse.json() as { id: string }

  const selectResponse = await request.post(`${API_URL}/api/workspaces/select`, {
    headers: { ...headers, 'Content-Type': 'application/json' },
    data: { workspaceId: workspace.id, sessionId: session.id },
  })
  expect(selectResponse.ok()).toBeTruthy()

  return { workspaceId: workspace.id, sessionId: session.id }
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
    if (!response.ok) {
      return { ok: false, status: response.status, payload }
    }
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

test.describe('mobile workspace header chrome', () => {
  test('shows a single workspace header after opening the mobile editor', async ({ page, request }, testInfo) => {
    test.setTimeout(90000)
    test.skip(!testInfo.project.name.startsWith('mobile'), 'mobile-only regression test')

    const { token, username, password } = await registerUser(request)
    const { sessionId } = await createWorkspaceAndSession(request, token)

    await page.addInitScript(([gatewayUrl]) => {
      window.localStorage.setItem('jait-gateway-url', gatewayUrl)
    }, [API_URL] as const)

    await page.goto('/')
    await loginInBrowser(page, username, password)
    await expect(page.getByText('History').first()).toBeVisible({ timeout: 15000 })

    const openResponse = await request.post(`${API_URL}/api/workspace/open`, {
      data: {
        path: WORKSPACE_ROOT,
        sessionId,
        nodeId: 'gateway',
      },
    })
    expect(openResponse.ok()).toBeTruthy()

    const editorButton = page.locator('button[aria-label="Editor"]').first()
    await editorButton.click()

    await expect(page.getByText('Tap a file in the Files tab to view it here.')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('[data-testid="mobile-workspace-tabbar"]')).toHaveCount(1)
    await expect(page.getByText('Editor', { exact: true })).toHaveCount(1)
  })
})
