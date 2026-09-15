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

async function createSelectedProject(request: APIRequestContext, token: string, projectTitle = 'Personal chat isolation', rootPath = PROJECT_ROOT) {
  const headers = { Authorization: `Bearer ${token}` }
  const projectResponse = await request.post(`${API_URL}/api/projects`, {
    headers,
    data: { rootPath, nodeId: 'gateway', title: projectTitle },
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
  return { projectTitle, projectId: project.id, sessionId: session.id }
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
  const { projectTitle } = await createSelectedProject(request, token)
  await authenticate(page, token)

  await page.getByRole('button', { name: 'Projects and chats', exact: true }).click()
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


test('personal to project A to project B preserves every chat assignment', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name.startsWith('mobile'), 'desktop navigation regression')
  const token = await registerUser(request)
  const headers = { Authorization: `Bearer ${token}` }
  const personalResponse = await request.post(`${API_URL}/api/sessions`, {
    headers, data: { name: 'Personal switching regression' },
  })
  expect(personalResponse.ok()).toBeTruthy()
  const personal = await personalResponse.json() as { id: string }
  const first = await createSelectedProject(request, token, 'Switch project A')
  const second = await createSelectedProject(request, token, 'Switch project B', path.join(PROJECT_ROOT, 'apps'))
  const selected = await request.post(`${API_URL}/api/projects/select`, {
    headers, data: { projectId: null, sessionId: personal.id },
  })
  expect(selected.ok()).toBeTruthy()
  await authenticate(page, token)
  await page.getByRole('button', { name: 'Projects and chats', exact: true }).click()

  for (const target of [first, second, first, second]) {
    const opened = page.waitForResponse(response => {
      if (response.request().method() !== 'POST' || !response.url().endsWith('/api/project/open')) return false
      return response.request().postDataJSON().sessionId === target.sessionId
    })
    await page.getByText(target.projectTitle, { exact: true }).first().click()
    expect((await opened).ok()).toBeTruthy()
    await expect.poll(async () => {
      const response = await request.get(`${API_URL}/api/projects/last-active`, { headers })
      const data = await response.json()
      return data.session?.id
    }).toBe(target.sessionId)
    for (const [sessionId, projectId] of [[personal.id, null], [first.sessionId, first.projectId], [second.sessionId, second.projectId]]) {
      const response = await request.get(`${API_URL}/api/sessions/${sessionId}`, { headers })
      expect(response.ok()).toBeTruthy()
      expect((await response.json()).projectId).toBe(projectId)
    }
  }
})
