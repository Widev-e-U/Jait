import path from 'node:path'

import { test, expect } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:8000'
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.resolve(process.cwd(), '..')

async function registerUser(request: Parameters<typeof test>[0]['request']) {
  const username = `e2e-mobile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
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
    data: { rootPath: WORKSPACE_ROOT, nodeId: 'gateway', title: 'Mobile reload regression' },
  })
  expect(workspaceResponse.ok()).toBeTruthy()
  const workspace = await workspaceResponse.json() as { id: string; rootPath: string | null }

  const sessionResponse = await request.post(`${API_URL}/api/workspaces/${workspace.id}/sessions`, {
    headers,
    data: { name: 'mobile close reload' },
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

async function getWorkspaceUiState(
  request: Parameters<typeof test>[0]['request'],
  token: string,
  workspaceId: string,
) {
  const response = await request.get(`${API_URL}/api/workspaces/${workspaceId}/state?keys=workspace.ui`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(response.ok()).toBeTruthy()
  const payload = await response.json() as {
    'workspace.ui'?: {
      panel?: { open?: boolean }
      layout?: { tree?: boolean; editor?: boolean }
    } | null
  }
  return payload['workspace.ui'] ?? null
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

test.describe('mobile workspace close + reload', () => {
  test.describe.configure({ mode: 'serial' })

  test('keeps the editor closed after an immediate reload on mobile', async ({ page, request }, testInfo) => {
    test.setTimeout(90000)
    test.skip(!testInfo.project.name.startsWith('mobile'), 'mobile-only regression test')

    const { token, username, password } = await registerUser(request)
    const { workspaceId, sessionId } = await createWorkspaceAndSession(request, token)

    await page.addInitScript(([gatewayUrl]) => {
      window.localStorage.setItem('jait-gateway-url', gatewayUrl)
    }, [API_URL] as const)

    await page.goto('/')
    await loginInBrowser(page, username, password)
    const historyMarker = page.getByText('History').first()
    await expect(historyMarker).toBeVisible({ timeout: 15000 })

    const openResponse = await request.post(`${API_URL}/api/workspace/open`, {
      data: {
        path: WORKSPACE_ROOT,
        sessionId,
        nodeId: 'gateway',
      },
    })
    expect(openResponse.ok()).toBeTruthy()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(historyMarker).toBeVisible({ timeout: 15000 })

    const editorButton = page.locator('button[aria-label="Editor"]').first()
    await editorButton.click()
    await expect.poll(async () => {
      const state = await getWorkspaceUiState(request, token, workspaceId)
      return state?.layout?.editor ?? null
    }, {
      timeout: 15000,
      message: 'mobile editor should be marked open before closing it again',
    }).toBe(true)

    await editorButton.click()

    await page.reload({ waitUntil: 'domcontentloaded' })

    await expect(historyMarker).toBeVisible({ timeout: 15000 })

    await expect.poll(async () => {
      const state = await getWorkspaceUiState(request, token, workspaceId)
      return {
        open: state?.panel?.open ?? null,
        tree: state?.layout?.tree ?? null,
        editor: state?.layout?.editor ?? null,
      }
    }, {
      timeout: 15000,
      message: 'workspace.ui should persist the closed mobile editor state',
    }).toEqual({
      open: false,
      tree: false,
      editor: false,
    })
  })
})
