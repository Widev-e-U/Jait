import path from 'node:path'

import { expect, test } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:8000'
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(process.cwd(), '../..')

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

async function createProjectAndSession(
  request: Parameters<typeof test>[0]['request'],
  token: string,
  title: string,
) {
  const headers = { Authorization: `Bearer ${token}` }

  const projectResponse = await request.post(`${API_URL}/api/projects`, {
    headers,
    data: { rootPath: PROJECT_ROOT, nodeId: 'gateway', title },
  })
  expect(projectResponse.ok()).toBeTruthy()
  const project = await projectResponse.json() as { id: string }

  const sessionResponse = await request.post(`${API_URL}/api/projects/${project.id}/sessions`, {
    headers,
    data: { name: 'sidebar actions visibility regression' },
  })
  expect(sessionResponse.ok()).toBeTruthy()
  const session = await sessionResponse.json() as { id: string }

  const selectResponse = await request.post(`${API_URL}/api/projects/select`, {
    headers: { ...headers, 'Content-Type': 'application/json' },
    data: { projectId: project.id, sessionId: session.id },
  })
  expect(selectResponse.ok()).toBeTruthy()

  return { projectId: project.id, sessionId: session.id }
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

test.describe('project sidebar actions', () => {
  test('keeps project action buttons fully visible in the sidebar', async ({ page, request }, testInfo) => {
    test.setTimeout(90_000)
    test.skip(testInfo.project.name.startsWith('mobile'), 'desktop sidebar regression only')

    const projectTitle = 'Project action visibility regression guard'
    const { token, username, password } = await registerUser(request)
    await createProjectAndSession(request, token, projectTitle)

    await page.setViewportSize({ width: 1280, height: 900 })
    await page.addInitScript(([gatewayUrl]) => {
      window.localStorage.setItem('jait-gateway-url', gatewayUrl)
    }, [API_URL] as const)

    await page.goto('/')
    await loginInBrowser(page, username, password)
    const toggleProjects = page.getByRole('button', { name: 'Projects and chats', exact: true })
    await expect(toggleProjects).toBeVisible({ timeout: 15_000 })
    if (await toggleProjects.getAttribute('aria-pressed') !== 'true') await toggleProjects.click()

    const sidebar = page.locator('aside').filter({
      has: page.getByText(projectTitle, { exact: true }),
    })
    await expect(sidebar).toBeVisible()

    const projectActionsButton = sidebar.getByRole('button', { name: 'Project actions' })
    const projectRow = projectActionsButton.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " group ")][1]')
    await projectRow.hover()
    await expect(projectActionsButton).toBeVisible()

    const sidebarBox = await sidebar.boundingBox()
    const actionsButtonBox = await projectActionsButton.boundingBox()
    expect(sidebarBox).not.toBeNull()
    expect(actionsButtonBox).not.toBeNull()
    assertWithinBounds(actionsButtonBox!, sidebarBox!)

    await projectActionsButton.focus()
    await projectActionsButton.press('Enter')
    const changeDirectoryAction = page.getByRole('menuitem', { name: 'Change directory' })
    const archiveProjectAction = page.getByRole('menuitem', { name: 'Archive project' })
    const viewport = page.viewportSize()
    expect(viewport).not.toBeNull()

    for (const action of [changeDirectoryAction, archiveProjectAction]) {
      await expect(action).toBeVisible()
      const actionBox = await action.boundingBox()
      expect(actionBox).not.toBeNull()
      assertWithinBounds(actionBox!, { x: 0, y: 0, width: viewport!.width, height: viewport!.height })
    }
  })
})


test('switches between Files and Source Control using sidebar icons', async ({ page, request }) => {
  test.setTimeout(60_000)
  const { token, username, password } = await registerUser(request)
  await createProjectAndSession(request, token, 'Editor icon navigation')
  await page.addInitScript(([gatewayUrl]) => {
    window.localStorage.setItem('jait-gateway-url', gatewayUrl)
    window.localStorage.setItem('jait.viewMode', 'developer')
  }, [API_URL] as const)
  await page.goto('/')
  await loginInBrowser(page, username, password)
  const files = page.getByRole('button', { name: 'Files', exact: true })
  if (!(await files.isVisible())) await page.getByRole('button', { name: 'Editor', exact: true }).click()
  const source = page.getByRole('button', { name: 'Source Control', exact: true })
  await expect(source).toBeVisible()
  await expect(source).toHaveText('')
  await source.click()
  await expect(source).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(/^Source Control \(\d+\)$/)).toBeVisible()
  await files.click()
  await expect(files).toHaveAttribute('aria-pressed', 'true')
  await expect(source).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText(/^Source Control \(\d+\)$/)).not.toBeVisible()
})
