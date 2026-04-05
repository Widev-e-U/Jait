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

async function setWorkspaceUiState(
  request: Parameters<typeof test>[0]['request'],
  token: string,
  workspaceId: string,
  value: Record<string, unknown> | null,
) {
  const response = await request.patch(`${API_URL}/api/workspaces/${workspaceId}/state`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    data: {
      'workspace.ui': value,
    },
  })
  expect(response.ok()).toBeTruthy()
}

async function expectWorkspaceUiState(
  request: Parameters<typeof test>[0]['request'],
  token: string,
  workspaceId: string,
  expected: {
    open: boolean | null
    tree: boolean | null
    editor: boolean | null
    previewOpen?: boolean | null
  },
) {
  await expect.poll(async () => {
    const state = await getWorkspaceUiState(request, token, workspaceId)
    return {
      open: state?.panel?.open ?? null,
      tree: state?.layout?.tree ?? null,
      editor: state?.layout?.editor ?? null,
      previewOpen: state?.preview?.open ?? null,
    }
  }, {
    timeout: 15000,
    message: 'workspace.ui should match the expected mobile layout state',
  }).toEqual({
    open: expected.open,
    tree: expected.tree,
    editor: expected.editor,
    previewOpen: expected.previewOpen ?? null,
  })
}

function mobileEditorPlaceholder(page: Parameters<typeof test>[0]['page']) {
  return page.getByText('Tap a file in the Files tab to view it here.')
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

  test('does not reopen the editor on reload when preview state is persisted', async ({ page, request }, testInfo) => {
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

    await setWorkspaceUiState(request, token, workspaceId, {
      panel: {
        open: false,
        remotePath: WORKSPACE_ROOT,
        nodeId: 'gateway',
      },
      layout: {
        tree: false,
        editor: false,
      },
      tabs: {
        remoteRoot: WORKSPACE_ROOT,
        tabs: [],
        activePath: null,
        activePreview: true,
      },
      terminal: null,
      preview: {
        open: true,
        target: null,
        workspaceRoot: WORKSPACE_ROOT,
        browserSessionId: null,
      },
    })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(historyMarker).toBeVisible({ timeout: 15000 })

    await expectWorkspaceUiState(request, token, workspaceId, {
      open: false,
      tree: false,
      editor: false,
      previewOpen: true,
    })
    await expect(page.getByText('Open or start a preview from the side controls.')).toHaveCount(0)
    await expect(mobileEditorPlaceholder(page)).toHaveCount(0)
  })

  test('does not reopen the editor on reload when architecture was open before closing it', async ({ page, request }, testInfo) => {
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

    const architectureButton = page.locator('button[aria-label="Open architecture"]').first()
    await architectureButton.click()
    await expect(page.getByText('Software Architecture')).toBeVisible({ timeout: 15000 })

    const editorButton = page.locator('button[aria-label="Editor"]').first()
    await editorButton.click()
    await expectWorkspaceUiState(request, token, workspaceId, {
      open: false,
      tree: false,
      editor: false,
    })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(historyMarker).toBeVisible({ timeout: 15000 })

    await expectWorkspaceUiState(request, token, workspaceId, {
      open: false,
      tree: false,
      editor: false,
    })
    await expect(page.getByText('Software Architecture')).toHaveCount(0)
    await expect(mobileEditorPlaceholder(page)).toHaveCount(0)
  })
})
