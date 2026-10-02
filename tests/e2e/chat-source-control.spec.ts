import path from 'node:path'
import { test, expect } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://127.0.0.1:8100'
const PROJECT_ROOT = path.resolve(__dirname, '../..')

for (const initiallyOpen of [true, false]) {
  test(`chat changed-files indicator opens source control with sidebar ${initiallyOpen ? 'open' : 'closed'}`, async ({ page, request }) => {
    const registration = await request.post(`${API_URL}/api/auth/register`, { data: {
      username: `source-control-${Date.now()}-${Math.random().toString(36).slice(2)}`, password: 'source-control-test-password',
    } })
    expect(registration.ok()).toBeTruthy()
    const { access_token: token } = await registration.json()
    const headers = { Authorization: `Bearer ${token}` }
    const projectResponse = await request.post(`${API_URL}/api/projects`, { headers, data: { rootPath: PROJECT_ROOT, nodeId: 'gateway', title: 'Source control regression' } })
    expect(projectResponse.ok()).toBeTruthy()
    const project = await projectResponse.json()
    expect((await request.post(`${API_URL}/api/projects/${project.id}/repository`, { headers, data: {} })).ok()).toBeTruthy()
    const sessionResponse = await request.post(`${API_URL}/api/projects/${project.id}/sessions`, { headers, data: { name: 'Changes navigation' } })
    expect(sessionResponse.ok()).toBeTruthy()
    const session = await sessionResponse.json()
    expect((await request.patch(`${API_URL}/api/projects/${project.id}/state`, { headers, data: {
      'project.ui': {
        panel: { open: initiallyOpen, remotePath: PROJECT_ROOT, nodeId: 'gateway' },
        tabs: { remoteRoot: PROJECT_ROOT, tabs: [], activePath: null },
        layout: { tree: initiallyOpen, editor: false, panelSize: 500, treeSize: 300 },
        terminal: null, preview: null,
      },
    } })).ok()).toBeTruthy()
    expect((await request.post(`${API_URL}/api/projects/select`, { headers, data: { projectId: project.id, sessionId: session.id } })).ok()).toBeTruthy()
    await page.addInitScript(({ token, api, open }) => {
      localStorage.setItem('jait-auth-token', token)
      sessionStorage.setItem('jait-auth-token', token)
      localStorage.setItem('token', token)
      localStorage.setItem('jait-gateway-url', api)
      localStorage.setItem('developerSidebarView', 'files')
      localStorage.setItem('showSessionsSidebar', String(open))
    }, { token, api: API_URL, open: initiallyOpen })
    await page.addLocatorHandler(page.getByText('A node needs your permission', { exact: true }), async () => {
      await page.getByRole('button', { name: 'Dismiss', exact: true }).click()
    })
    await page.route(`**/api/sessions/${session.id}/messages**`, (route) => route.fulfill({ json: {
      messages: [{ id: 'reply-1', role: 'assistant', content: 'Ready to review changes.' }],
      total: 1, streaming: false, lastActiveAt: new Date().toISOString(), seq: 0,
    } }))
    await page.route('**/api/git/status**', (route) => route.fulfill({ json: {
      index: { files: [], insertions: 0, deletions: 0 },
      workingTree: { files: [{ path: 'package.json', status: 'M' }], insertions: 3, deletions: 1 },
    } }))
    await page.setViewportSize({ width: 2200, height: 900 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const indicator = page.getByRole('button', { name: '1 changed file. Open source control.', exact: true })
    await expect(indicator).toBeVisible({ timeout: 15000 })
    await indicator.click()
    await expect(page.getByRole('button', { name: 'Source Control', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Source Control (1)', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Stage file', exact: true })).toBeVisible()
    await indicator.click()
    await expect(page.getByText('Source Control (1)', { exact: true })).toBeVisible()
  })
}
