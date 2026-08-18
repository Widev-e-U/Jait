import path from 'node:path'

import { expect, test } from '@playwright/test'
import type { APIRequestContext, Page } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:8000'
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(process.cwd(), '../..')

async function registerUser(request: APIRequestContext) {
  const username = `e2e-personal-chat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const password = 'supersecret123'
  const response = await request.post(`${API_URL}/api/auth/register`, {
    data: { username, password },
  })
  expect(response.ok()).toBeTruthy()
  const payload = await response.json() as { access_token: string }
  return payload.access_token
}

async function createSelectedProject(request: APIRequestContext, token: string) {
  const projectTitle = 'Personal chat isolation'
  const headers = { Authorization: `Bearer ${token}` }
  const projectResponse = await request.post(`${API_URL}/api/projects`, {
    headers,
    data: { rootPath: PROJECT_ROOT, nodeId: 'gateway', title: projectTitle },
  })
  expect(projectResponse.ok()).toBeTruthy()
  const project = await projectResponse.json() as { id: string }

  const sessionResponse = await request.post(`${API_URL}/api/projects/${project.id}/sessions`, {
    headers,
    data: { name: 'Project chat' },
  })
  expect(sessionResponse.ok()).toBeTruthy()
  const session = await sessionResponse.json() as { id: string }

  const selectResponse = await request.post(`${API_URL}/api/projects/select`, {
    headers,
    data: { projectId: project.id, sessionId: session.id },
  })
  expect(selectResponse.ok()).toBeTruthy()
  return projectTitle
}

async function authenticate(page: Page, token: string) {
  await page.addInitScript(([gatewayUrl, authToken]) => {
    window.localStorage.setItem('jait-gateway-url', gatewayUrl)
    window.localStorage.setItem('jait-auth-token', authToken)
  }, [API_URL, token] as const)
  await page.goto('/')
}

test('global new chat stays personal after opening a project', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'desktop composer regression only')

  const token = await registerUser(request)
  const projectTitle = await createSelectedProject(request, token)
  await authenticate(page, token)

  await page.getByRole('button', { name: 'Toggle projects panel', exact: true }).click()
  const projectRow = page.getByText(projectTitle, { exact: true }).first()
  await expect(projectRow).toBeVisible({ timeout: 15_000 })
  await projectRow.click()

  const newChatButton = page.getByRole('button', { name: 'New chat', exact: true })
  await expect(newChatButton).toBeVisible({ timeout: 15_000 })

  const createdSession = page.waitForResponse(async (response) => {
    if (response.request().method() !== 'POST' || response.status() !== 201) return false
    const url = new URL(response.url())
    return url.pathname === '/api/sessions' || /\/api\/projects\/[^/]+\/sessions$/.test(url.pathname)
  })
  await newChatButton.click()
  await page.getByRole('menuitem', { name: 'Open here', exact: true }).click()

  const response = await createdSession
  const session = await response.json() as { id: string; projectId: string | null }
  expect(session.projectId).toBeNull()

  await expect.poll(async () => {
    const lastActiveResponse = await request.get(`${API_URL}/api/projects/last-active`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const lastActive = await lastActiveResponse.json() as {
      project: { id: string } | null
      session: { id: string } | null
    }
    return { projectId: lastActive.project?.id ?? null, sessionId: lastActive.session?.id ?? null }
  }).toEqual({ projectId: null, sessionId: session.id })
})
