import path from 'node:path'
import { expect, test } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://127.0.0.1:8100'
const PROJECT_ROOT = path.resolve(process.cwd(), '../..')

test('hiding the editor releases its live preview session', async ({ page, request }) => {
  test.setTimeout(90_000)
  const username = `e2e-preview-close-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const password = 'supersecret123'
  const registration = await request.post(`${API_URL}/api/auth/register`, { data: { username, password } })
  expect(registration.ok()).toBeTruthy()
  const { access_token: token } = await registration.json() as { access_token: string }
  const headers = { Authorization: `Bearer ${token}` }
  const projectResponse = await request.post(`${API_URL}/api/projects`, {
    headers,
    data: { rootPath: PROJECT_ROOT, nodeId: 'gateway', title: 'Preview cleanup regression' },
  })
  expect(projectResponse.ok()).toBeTruthy()
  const project = await projectResponse.json() as { id: string }
  const sessionResponse = await request.post(`${API_URL}/api/projects/${project.id}/sessions`, {
    headers,
    data: { name: 'preview cleanup' },
  })
  expect(sessionResponse.ok()).toBeTruthy()
  const session = await sessionResponse.json() as { id: string }
  await request.post(`${API_URL}/api/projects/select`, {
    headers,
    data: { projectId: project.id, sessionId: session.id },
  })

  let stopCount = 0
  const previewSession = {
    sessionId: session.id,
    target: 'http://127.0.0.1:4173/',
    url: null,
    status: 'ready',
    logs: [],
    browserEvents: [],
    remoteBrowser: null,
  }
  await page.route('**/api/preview/session/*', route => route.fulfill({ json: { session: previewSession } }))
  await page.route('**/api/preview/start', route => route.fulfill({ json: { session: previewSession } }))
  await page.route('**/api/preview/stop', route => {
    stopCount += 1
    return route.fulfill({ json: { ok: true } })
  })
  await page.addInitScript(([gatewayUrl, authToken]) => {
    localStorage.setItem('jait-gateway-url', gatewayUrl)
    localStorage.setItem('jait-auth-token', authToken)
  }, [API_URL, token] as const)
  await page.goto('/')

  const editorButton = page.getByRole('button', { name: 'Editor', exact: true }).first()
  await expect(editorButton).toBeVisible({ timeout: 20_000 })
  const previewButton = page.getByRole('button', { name: 'Open preview' })
  if (!await previewButton.isVisible()) await editorButton.click()
  await expect(previewButton).toBeVisible({ timeout: 20_000 })
  await previewButton.click()
  await expect(page.getByRole('button', { name: 'Close preview' })).toBeVisible()
  await page.getByRole('button', { name: 'Editor', exact: true }).first().click()
  await expect(page.getByRole('button', { name: 'Open preview' })).toHaveCount(0)
  await expect.poll(() => stopCount).toBeGreaterThan(0)
})
