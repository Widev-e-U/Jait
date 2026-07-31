import path from 'node:path'

import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:8000'
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.resolve(process.cwd(), '../..')

async function registerUser(request: APIRequestContext) {
  const username = `e2e-prompt-overlays-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const password = 'supersecret123'

  const response = await request.post(`${API_URL}/api/auth/register`, {
    data: { username, password },
  })
  expect(response.ok()).toBeTruthy()
  const payload = await response.json() as { access_token: string }
  return { token: payload.access_token, username, password }
}

async function createProjectAndSession(request: APIRequestContext, token: string) {
  const headers = { Authorization: `Bearer ${token}` }
  const projectResponse = await request.post(`${API_URL}/api/projects`, {
    headers,
    data: { rootPath: PROJECT_ROOT, nodeId: 'gateway', title: 'Prompt overlay regression' },
  })
  expect(projectResponse.ok()).toBeTruthy()
  const project = await projectResponse.json() as { id: string }

  const sessionResponse = await request.post(`${API_URL}/api/projects/${project.id}/sessions`, {
    headers,
    data: { name: 'prompt overlay regression' },
  })
  expect(sessionResponse.ok()).toBeTruthy()
  const session = await sessionResponse.json() as { id: string }

  const selectResponse = await request.post(`${API_URL}/api/projects/select`, {
    headers: { ...headers, 'Content-Type': 'application/json' },
    data: { projectId: project.id, sessionId: session.id },
  })
  expect(selectResponse.ok()).toBeTruthy()
  return { sessionId: session.id }
}

async function loginInBrowser(page: Page, username: string, password: string) {
  const result = await page.evaluate(async ([gatewayUrl, nextUsername, nextPassword]) => {
    const response = await fetch(`${gatewayUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username: nextUsername, password: nextPassword }),
    })
    const payload = await response.json().catch(() => ({})) as { access_token?: string }
    if (!response.ok || !payload.access_token) return false
    window.localStorage.setItem('jait-auth-token', payload.access_token)
    window.sessionStorage.setItem('jait-auth-token', payload.access_token)
    window.localStorage.setItem('token', payload.access_token)
    return true
  }, [API_URL, username, password] as const)
  expect(result).toBe(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
}

async function expectMenuHitTestable(menu: Locator) {
  await expect(menu).toBeVisible()
  const receivesPointerAtTop = await menu.evaluate((element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + Math.min(rect.height / 2, 24))
    return Boolean(hit && (hit === element || element.contains(hit)))
  })
  expect(receivesPointerAtTop).toBe(true)
}

test.describe('prompt suggestion overlays', () => {
  test('keeps slash and mention menus visible above the rounded composer', async ({ page, request }, testInfo) => {
    test.setTimeout(90_000)
    test.skip(testInfo.project.name.startsWith('mobile'), 'desktop composer regression only')

    const { token, username, password } = await registerUser(request)
    const { sessionId } = await createProjectAndSession(request, token)
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.route('**/api/skills', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([{
          id: 'overlay-regression',
          name: 'Overlay regression',
          description: 'Verifies the slash-command menu remains visible',
          enabled: true,
        }]),
      })
    })
    await page.addInitScript(([gatewayUrl]) => {
      window.localStorage.setItem('jait-gateway-url', gatewayUrl)
    }, [API_URL] as const)

    await page.goto('/')
    await loginInBrowser(page, username, password)

    const openResponse = await request.post(`${API_URL}/api/project/open`, {
      data: { path: PROJECT_ROOT, sessionId, nodeId: 'gateway' },
    })
    expect(openResponse.ok()).toBeTruthy()

    const composer = page.getByRole('textbox').last()
    await expect(composer).toBeVisible({ timeout: 15_000 })

    await composer.pressSequentially('@')
    const fileSuggestions = page.getByRole('listbox', { name: 'File suggestions' })
    await expectMenuHitTestable(fileSuggestions)
    await expect(composer).toBeFocused()

    await composer.press('Escape')
    await expect(fileSuggestions).toBeHidden()
    await composer.fill('')
    await composer.pressSequentially('/')
    await expectMenuHitTestable(page.getByRole('listbox', { name: 'Skill suggestions' }))
    await expect(composer).toBeFocused()
  })
})
