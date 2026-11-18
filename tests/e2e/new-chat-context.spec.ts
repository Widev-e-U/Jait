import path from 'node:path'
import { expect, test } from '@playwright/test'
import { registerAgentTestUser } from './helpers/agent-user'

const api = process.env.API_URL || 'http://127.0.0.1:8100'

for (const width of [390, 1280]) {
  test(`new chat context preserves drafts and remembers projects at ${width}px`, async ({ page, request }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width, height: 850 })
    const token = await registerAgentTestUser(request, api, `chat-context-${width}-${Date.now()}`, 'new-chat-context-test-password')
    const headers = { Authorization: `Bearer ${token}` }
    async function createProject(title: string) {
      const response = await request.post(api + '/api/projects', { headers, data: { title, kind: 'folder' } })
      expect(response.ok()).toBeTruthy()
      return await response.json() as { id: string }
    }
    const otherProject = await createProject('Homelab fixture')
    for (let index = 0; index < 6; index++) await createProject(`Other fixture ${index}`)
    const initialProject = await createProject('Jait fixture')
    const created = await request.post(api + `/api/projects/${initialProject.id}/sessions`, { headers, data: { name: 'New Chat' } })
    expect(created.ok()).toBeTruthy()
    const session = await created.json() as { id: string }
    await page.context().addCookies([{ name: 'jait_token', value: token, url: api, httpOnly: true, sameSite: 'Lax' }])
    await page.addInitScript(({ token, api }) => {
      localStorage.setItem('jait-auth-token', token)
      sessionStorage.setItem('jait-auth-token', token)
      localStorage.setItem('jait-gateway-url', api)
      localStorage.setItem('theme', 'dark')
    }, { token, api })
    await page.goto(`/?sessionId=${session.id}&projectId=${initialProject.id}`)
    const selector = page.getByTestId('new-chat-context')
    const personal = selector.getByRole('button', { name: 'Personal', exact: true })
    const project = selector.getByRole('button', { name: 'Project', exact: true })
    await expect(project).toBeEnabled({ timeout: 45_000 })
    await expect(project).toHaveAttribute('aria-pressed', 'true')
    const composer = page.locator('[role="textbox"][contenteditable="true"]').first()
    await composer.fill('Keep this draft while I choose a context')
    async function expectDestination(projectId: string | null) {
      await expect.poll(async () => {
        const response = await request.get(api + `/api/sessions/${session.id}`, { headers })
        return (await response.json()).projectId
      }).toBe(projectId)
      await expect(personal).toBeEnabled()
      await expect(composer).toHaveText('Keep this draft while I choose a context')
    }
    await personal.click()
    await expectDestination(null)
    await expect(personal).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Explain quantum computing', exact: true })).toBeVisible()
    await project.click()
    await expectDestination(initialProject.id)
    await expect(page.getByRole('button', { name: 'Explain this codebase', exact: true })).toBeVisible()
    await selector.getByRole('button', { name: 'Choose project, current project: Jait fixture' }).click()
    await page.getByRole('textbox', { name: 'Find a project' }).fill('Homelab fixture')
    const option = page.getByRole('dialog', { name: 'Choose a project' }).getByRole('button', { name: /Homelab fixture/ })
    await expect(option).toBeVisible()
    // A rejected move must leave the draft and destination intact.
    await page.route('**/api/sessions/*/move', route => route.fulfill({ status: 409, json: { error: 'Test move rejected' } }), { times: 1 })
    await option.click()
    await expect(page.getByText('Could not change the chat context. Please try again.')).toBeVisible()
    await expectDestination(initialProject.id)
    // A failed project selection reopens the picker for recovery.
    await expect(page.getByRole('dialog', { name: 'Choose a project' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Find a project' }).fill('Homelab fixture')
    await option.click()
    await expectDestination(otherProject.id)
    await personal.click()
    await expectDestination(null)
    // A reload while in Personal mode must retain the separate project memory.
    await page.goto(`/?sessionId=${session.id}`)
    await expect(personal).toBeEnabled({ timeout: 45_000 })
    await expect(personal).toHaveAttribute('aria-pressed', 'true')
    await project.click()
    await expect(selector.getByRole('button', { name: 'Choose project, current project: Homelab fixture' })).toBeVisible()
    await expect(project).toBeEnabled()
    const personalSessions = await request.get(api + '/api/sessions?personal=true&status=active', { headers })
    expect((await personalSessions.json()).sessions).toHaveLength(0)
    const target = await request.get(api + `/api/projects/${otherProject.id}`, { headers })
    expect((await target.json()).sessions.map((entry: { id: string }) => entry.id)).toEqual([session.id])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/', `new-chat-context-${width}.png`) })
    if (width === 1280) {
      await personal.click()
      await expect(personal).toBeEnabled()
      await expect(personal).toHaveAttribute('aria-pressed', 'true')
      await page.evaluate(() => {
        const key = Object.keys(localStorage).find(key => key.startsWith('jait:last-chat-project:v1:'))
        if (!key) throw new Error('Missing remembered project')
        localStorage.setItem(key, 'removed-project')
      })
      await page.goto(`/?sessionId=${session.id}`)
      await expect(personal).toBeEnabled({ timeout: 45_000 })
      await expect(personal).toHaveAttribute('aria-pressed', 'true')
      await project.click()
      await expect(page.getByText('This project is no longer available. Choose another project.')).toBeVisible()
      await expect(page.getByRole('dialog', { name: 'Choose a project' })).toBeVisible()
      await expect(personal).toHaveAttribute('aria-pressed', 'true')
    }
  })
}
