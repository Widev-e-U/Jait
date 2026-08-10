import { mkdir } from 'node:fs/promises'
import { test, expect } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://localhost:8000'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'
const CONFIGURED_PROJECT_ROOT = process.env.PROJECT_ROOT

async function registerUser(request: Parameters<typeof test>[0]['request']) {
  const username = `e2e-ui-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const password = 'supersecret123'

  const response = await request.post(`${API_URL}/api/auth/register`, {
    data: { username, password },
  })
  expect(response.ok()).toBeTruthy()
  const payload = await response.json() as { access_token: string }
  return { token: payload.access_token, username, password }
}

async function createSession(
  request: Parameters<typeof test>[0]['request'],
  token: string,
  name: string,
  projectRoot: string,
) {
  const headers = { Authorization: `Bearer ${token}` }
  const projectResponse = await request.post(`${API_URL}/api/projects`, {
    headers,
    data: { rootPath: projectRoot, nodeId: 'gateway', title: name },
  })
  expect(projectResponse.ok()).toBeTruthy()
  const project = await projectResponse.json() as { id: string }

  const sessionName = `${name} session`
  const sessionResponse = await request.post(`${API_URL}/api/projects/${project.id}/sessions`, {
    headers,
    data: { name: sessionName },
  })
  expect(sessionResponse.ok()).toBeTruthy()
  const session = await sessionResponse.json() as { id: string }

  const selectResponse = await request.post(`${API_URL}/api/projects/select`, {
    headers,
    data: { projectId: project.id, sessionId: session.id },
  })
  expect(selectResponse.ok()).toBeTruthy()
  return { projectId: project.id, sessionId: session.id, sessionName }
}

test.describe('WS UI reactions for project and preview tools', () => {
  test('project.editor.open and preview.open update the UI, and architecture stays available', async ({ page, request }, testInfo) => {
    test.setTimeout(90000)
    test.skip(testInfo.project.name.startsWith('mobile'), 'desktop toolbar assertions only')

    const projectRoot = CONFIGURED_PROJECT_ROOT || testInfo.outputPath('project')
    await mkdir(projectRoot, { recursive: true })
    const { token } = await registerUser(request)
    const { projectId, sessionId, sessionName } = await createSession(request, token, 'ws-ui-e2e', projectRoot)

    await page.addInitScript(([gatewayUrl, authToken]) => {
      window.localStorage.setItem('jait-gateway-url', gatewayUrl)
      window.localStorage.setItem('jait-auth-token', authToken)
      const testWindow = window as typeof window & { __e2eUiWsSessionId?: string }
      const BrowserWebSocket = window.WebSocket
      window.WebSocket = class extends BrowserWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          if (protocols === undefined) super(url)
          else super(url, protocols)
          this.addEventListener('message', (event) => {
            try {
              const message = JSON.parse(String(event.data)) as {
                type?: string
                sessionId?: string
                payload?: { subscribed?: boolean }
              }
              if (message.type === 'session.created' && message.payload?.subscribed && message.sessionId) {
                testWindow.__e2eUiWsSessionId = message.sessionId
              }
            } catch {}
          })
        }

      }
    }, [API_URL, token])

    await page.goto(`/?projectId=${encodeURIComponent(projectId)}&sessionId=${encodeURIComponent(sessionId)}`)
    const projectsSidebarButton = page.getByRole('button', { name: 'Toggle projects panel', exact: true })
    await expect(projectsSidebarButton).toBeVisible({ timeout: 15000 })
    await projectsSidebarButton.click()
    const sessionButton = page.getByText(sessionName, { exact: true })
    await expect(sessionButton).toBeVisible()
    await sessionButton.click()
    await page.waitForFunction((expectedSessionId) => (
      (window as typeof window & { __e2eUiWsSessionId?: string }).__e2eUiWsSessionId === expectedSessionId
    ), sessionId)

    const approveAll = await request.post(`${API_URL}/api/consent/pending/${sessionId}/approve-all`, {
      data: {},
    })
    expect(approveAll.ok()).toBeTruthy()

    const openProject = await request.post(`${API_URL}/api/tools/execute`, {
      data: {
        tool: 'project.editor.open',
        input: {},
        sessionId,
        projectRoot,
      },
    })
    expect(openProject.ok()).toBeTruthy()
    const projectBody = await openProject.json() as { ok: boolean }
    expect(projectBody.ok).toBe(true)

    await expect(projectsSidebarButton).toBeVisible()

    const openPreview = await request.post(`${API_URL}/api/tools/execute`, {
      data: {
        tool: 'preview.open',
        input: {
          target: FRONTEND_URL,
          projectRoot,
        },
        sessionId,
        projectRoot,
      },
    })
    expect(openPreview.ok()).toBeTruthy()
    const previewBody = await openPreview.json() as { ok: boolean }
    expect(previewBody.ok).toBe(true)

    await expect(page.locator(`iframe[title="${FRONTEND_URL}"]`)).toBeVisible({ timeout: 20000 })

    const sendArchitecture = await request.post(`${API_URL}/api/tools/execute`, {
      data: {
        tool: 'architecture.generate',
        input: {
          diagram: 'flowchart TD\nA[Gateway] --> B[Web UI]',
        },
        sessionId,
        projectRoot,
      },
    })
    expect(sendArchitecture.ok()).toBeTruthy()
    const architectureBody = await sendArchitecture.json() as { ok: boolean }
    expect(architectureBody.ok).toBe(true)

    await expect(page.getByTitle('Regenerate diagram')).toBeVisible()

    await request.post(`${API_URL}/api/tools/execute`, {
      data: {
        tool: 'preview.stop',
        input: {},
        sessionId,
        projectRoot,
      },
    })
  })
})
