import path from 'node:path'

import { expect, test } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:8000'
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.resolve(process.cwd(), '..')

async function registerUser(request: Parameters<typeof test>[0]['request']) {
  const username = `e2e-sidebar-actions-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
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
  title: string,
) {
  const headers = { Authorization: `Bearer ${token}` }

  const workspaceResponse = await request.post(`${API_URL}/api/workspaces`, {
    headers,
    data: { rootPath: WORKSPACE_ROOT, nodeId: 'gateway', title },
  })
  expect(workspaceResponse.ok()).toBeTruthy()
  const workspace = await workspaceResponse.json() as { id: string }

  const sessionResponse = await request.post(`${API_URL}/api/workspaces/${workspace.id}/sessions`, {
    headers,
    data: { name: 'sidebar actions visibility regression' },
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

function assertWithinBounds(
  childBox: { x: number; y: number; width: number; height: number },
  parentBox: { x: number; y: number; width: number; height: number },
) {
  expect(childBox.x).toBeGreaterThanOrEqual(parentBox.x - 1)
  expect(childBox.y).toBeGreaterThanOrEqual(parentBox.y - 1)
  expect(childBox.x + childBox.width).toBeLessThanOrEqual(parentBox.x + parentBox.width + 1)
  expect(childBox.y + childBox.height).toBeLessThanOrEqual(parentBox.y + parentBox.height + 1)
}

test.describe('workspace sidebar actions', () => {
  test('keeps workspace action buttons fully visible in the sidebar', async ({ page, request }, testInfo) => {
    test.setTimeout(90_000)
    test.skip(testInfo.project.name.startsWith('mobile'), 'desktop sidebar regression only')

    const workspaceTitle = 'Workspace action visibility regression guard'
    const { token, username, password } = await registerUser(request)
    await createWorkspaceAndSession(request, token, workspaceTitle)

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.addInitScript(([gatewayUrl]) => {
      window.localStorage.setItem('jait-gateway-url', gatewayUrl)
    }, [API_URL] as const)

    await page.goto('/')
    await loginInBrowser(page, username, password)
    await expect(page.getByText('Chats & Workspaces')).toBeVisible({ timeout: 15_000 })

    const sidebar = page.locator('aside').first()
    await expect(sidebar).toBeVisible()

    const workspaceRow = sidebar.locator('div.group').filter({
      has: page.getByText(workspaceTitle, { exact: true }),
    }).first()
    await expect(workspaceRow).toBeVisible()
    await workspaceRow.hover()

    const changeDirectoryButton = workspaceRow.getByRole('button', { name: 'Change directory' })
    const archiveWorkspaceButton = workspaceRow.getByRole('button', { name: 'Archive workspace' })
    await expect(changeDirectoryButton).toBeVisible()
    await expect(archiveWorkspaceButton).toBeVisible()

    const sidebarBox = await sidebar.boundingBox()
    const rowBox = await workspaceRow.boundingBox()
    expect(sidebarBox).not.toBeNull()
    expect(rowBox).not.toBeNull()

    for (const button of [changeDirectoryButton, archiveWorkspaceButton]) {
      await expect(button).toBeVisible()
      const buttonBox = await button.boundingBox()
      expect(buttonBox).not.toBeNull()
      assertWithinBounds(buttonBox!, sidebarBox!)
      assertWithinBounds(buttonBox!, rowBox!)
    }
  })
})
