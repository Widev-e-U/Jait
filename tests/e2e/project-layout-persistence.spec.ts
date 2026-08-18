import path from 'node:path'

import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:8000'
const PROJECT_A_ROOT = path.resolve(process.cwd(), '../..')
const PROJECT_B_ROOT = path.join(PROJECT_A_ROOT, 'apps/web')
const PROJECT_C_ROOT = path.join(PROJECT_A_ROOT, 'packages/gateway')

async function registerUser(request: APIRequestContext) {
  const username = `e2e-project-layout-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const password = 'supersecret123'
  const response = await request.post(`${API_URL}/api/auth/register`, {
    data: { username, password },
  })
  expect(response.ok()).toBeTruthy()
  const payload = await response.json() as { access_token: string }
  return payload.access_token
}

async function createProject(
  request: APIRequestContext,
  token: string,
  title: string,
  rootPath: string,
  panelSize: number,
  treeSize: number,
) {
  const headers = { Authorization: `Bearer ${token}` }
  const projectResponse = await request.post(`${API_URL}/api/projects`, {
    headers,
    data: { rootPath, nodeId: 'gateway', title },
  })
  expect(projectResponse.ok()).toBeTruthy()
  const project = await projectResponse.json() as { id: string }

  const sessionResponse = await request.post(`${API_URL}/api/projects/${project.id}/sessions`, {
    headers,
    data: { name: `${title} chat` },
  })
  expect(sessionResponse.ok()).toBeTruthy()
  const session = await sessionResponse.json() as { id: string }

  const stateResponse = await request.patch(`${API_URL}/api/projects/${project.id}/state`, {
    headers: { ...headers, 'Content-Type': 'application/json' },
    data: {
      'project.ui': {
        panel: { open: true, remotePath: rootPath, nodeId: 'gateway' },
        tabs: { remoteRoot: rootPath, tabs: [], activePath: null },
        layout: { tree: true, editor: true, panelSize, treeSize },
        terminal: null,
        preview: null,
      },
    },
  })
  expect(stateResponse.ok()).toBeTruthy()
  return { projectId: project.id, sessionId: session.id }
}

async function expectPanelWidth(page: Page, expected: number) {
  const panel = page.locator('aside:has(.sash-handle)').first()
  await expect(panel).toBeVisible({ timeout: 15000 })
  await expect.poll(async () => Math.round((await panel.boundingBox())?.width ?? 0), {
    timeout: 15000,
  }).toBe(expected)
}

async function resizePanel(page: Page, delta: number) {
  const panelHandle = page.locator('aside:has(.sash-handle) .sash-handle').last()
  const handleBox = await panelHandle.boundingBox()
  expect(handleBox).not.toBeNull()
  const centerX = handleBox!.x + handleBox!.width / 2
  const centerY = handleBox!.y + handleBox!.height / 2
  await page.mouse.move(centerX, centerY)
  await page.mouse.down()
  await page.mouse.move(centerX + delta, centerY, { steps: 5 })
  await page.mouse.up()
}

async function switchProject(page: Page, title: string) {
  const projectLabel = page.getByText(title, { exact: true }).first()
  if (!await projectLabel.isVisible()) {
    await page.getByRole('button', { name: 'Toggle projects panel' }).click()
  }
  await expect(projectLabel).toBeVisible()
  await projectLabel.click()
}

async function expectSavedPanelWidth(
  request: APIRequestContext,
  token: string,
  projectId: string,
  expected: number,
) {
  await expect.poll(async () => {
    const response = await request.get(`${API_URL}/api/projects/${projectId}/state?keys=project.ui`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const payload = await response.json() as {
      'project.ui'?: { layout?: { panelSize?: number } | null } | null
    }
    return payload['project.ui']?.layout?.panelSize ?? null
  }, { timeout: 15000 }).toBe(expected)
}

test('restores each project panel size through a switch and reload cycle', async ({ page, request }) => {
  test.setTimeout(120000)
  const token = await registerUser(request)
  const projectA = await createProject(request, token, 'Layout project A', PROJECT_A_ROOT, 640, 300)
  const projectB = await createProject(request, token, 'Layout project B', PROJECT_B_ROOT, 500, 240)
  const projectC = await createProject(request, token, 'Layout project C', PROJECT_C_ROOT, 620, 280)

  const selectResponse = await request.post(`${API_URL}/api/projects/select`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    data: { projectId: projectA.projectId, sessionId: projectA.sessionId },
  })
  expect(selectResponse.ok()).toBeTruthy()

  await page.addInitScript(([gatewayUrl, authToken]) => {
    window.localStorage.setItem('jait-gateway-url', gatewayUrl)
    window.localStorage.setItem('jait-auth-token', authToken)
  }, [API_URL, token] as const)

  await page.goto('/')
  await expectPanelWidth(page, 640)

  await resizePanel(page, -60)
  await expectPanelWidth(page, 580)
  await expectSavedPanelWidth(request, token, projectA.projectId, 580)

  await switchProject(page, 'Layout project B')
  await expectPanelWidth(page, 500)
  await resizePanel(page, 40)
  await expectPanelWidth(page, 540)
  await expectSavedPanelWidth(request, token, projectB.projectId, 540)

  await switchProject(page, 'Layout project C')
  await expectPanelWidth(page, 620)
  await expectSavedPanelWidth(request, token, projectC.projectId, 620)

  await switchProject(page, 'Layout project A')
  await expectPanelWidth(page, 580)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expectPanelWidth(page, 580)
  await expectSavedPanelWidth(request, token, projectA.projectId, 580)

  await switchProject(page, 'Layout project C')
  await expectPanelWidth(page, 620)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expectPanelWidth(page, 620)
  await expectSavedPanelWidth(request, token, projectC.projectId, 620)

  await switchProject(page, 'Layout project B')
  await expectPanelWidth(page, 540)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expectPanelWidth(page, 540)
  await expectSavedPanelWidth(request, token, projectB.projectId, 540)

  await switchProject(page, 'Layout project A')
  await expectPanelWidth(page, 580)
})
