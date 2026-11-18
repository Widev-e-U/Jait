import { test, expect } from '@playwright/test'
import path from 'node:path'
import { registerAgentTestUser } from './helpers/agent-user'

const API_URL = process.env.API_URL || 'http://127.0.0.1:8100'

test('personal device selector scopes providers and restores the saved device', async ({ page, request }) => {
  const token = await registerAgentTestUser(request, API_URL, `personal-node-${Date.now()}`, 'personal-node-test-password')
  const headers = { Authorization: `Bearer ${token}` }
  const created = await request.post(`${API_URL}/api/sessions`, { headers, data: { name: 'Personal node test' } })
  expect(created.ok(), await created.text()).toBeTruthy()
  let session = await created.json()
  await page.route(`**/api/sessions/${session.id}`, async route => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON()
      const metadata = JSON.parse(session.metadata ?? '{}')
      session = { ...session, metadata: JSON.stringify({ ...metadata, chat: { ...metadata.chat, ...body } }) }
    }
    await route.fulfill({ json: session })
  })
  await page.route(/\/api\/providers(?:\?|$)/, route => route.fulfill({ json: {
    providers: [
      { id: 'jait', name: 'Jait', available: true, modes: ['full-access', 'supervised'], nodeId: 'gateway' },
      { id: 'local-codex', providerType: 'codex', name: 'Local Codex', available: true, modes: ['full-access', 'supervised'], nodeId: 'gateway' },
      { id: 'remote-codex', providerType: 'codex', name: 'Remote Codex', available: true, modes: ['full-access', 'supervised'], nodeId: 'node-a', nodeName: 'Desktop A' },
    ],
    remoteProviders: [{ nodeId: 'node-a', nodeName: 'Desktop A', platform: 'windows', providers: ['codex'] }],
  } }))
  await page.route('**/api/providers/*/models*', route => route.fulfill({ json: { models: [] } }))
  await page.context().addCookies([{ name: 'jait_token', value: token, url: API_URL, httpOnly: true, sameSite: 'Lax' }])
  await page.addInitScript(({ token, api }) => {
    localStorage.setItem('jait-auth-token', token)
    sessionStorage.setItem('jait-auth-token', token)
    localStorage.setItem('jait-gateway-url', api)
    localStorage.setItem('jait.viewMode', 'developer')
  }, { token, api: API_URL })
  await page.goto(`/chat?sessionId=${session.id}`)
  const node = page.getByRole('button', { name: 'Chat node', exact: true })
  await expect(node).toBeEnabled()
  await expect(node).toContainText('Gateway')
  const provider = page.getByRole('button', { name: /^Provider .*model/ })
  const nodeBounds = await node.boundingBox()
  const providerBounds = await provider.boundingBox()
  expect(nodeBounds!.x + nodeBounds!.width).toBeLessThanOrEqual(providerBounds!.x)
  await node.click()
  await page.getByRole('menuitemradio', { name: 'Desktop A' }).click()
  await expect(node).toContainText('Desktop A')
  await expect(node).toBeEnabled()
  expect(JSON.parse(session.metadata).chat.nodeId).toBe('node-a')
  await provider.click()
  await expect(page.getByText('Remote Codex', { exact: true })).toBeVisible()
  await expect(page.getByText('Local Codex', { exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.reload()
  await expect(node).toContainText('Desktop A')
  await page.screenshot({ path: path.resolve(__dirname, '../../.jait/shots/personal-chat-node.png'), fullPage: true })
  await node.click()
  await page.getByRole('menuitemradio', { name: 'Gateway', exact: true }).click()
  await expect(node).toContainText('Gateway')
  const projectResponse = await request.post(`${API_URL}/api/projects`, { headers, data: { title: 'Project device test', rootPath: '/work/project', nodeId: 'gateway' } })
  expect(projectResponse.ok(), await projectResponse.text()).toBeTruthy()
  const project = await projectResponse.json()
  const projectChatResponse = await request.post(`${API_URL}/api/sessions`, { headers, data: { name: 'Project chat', projectId: project.id } })
  expect(projectChatResponse.ok()).toBeTruthy()
  const projectChat = await projectChatResponse.json()
  await page.goto(`/chat?sessionId=${projectChat.id}`)
  await expect(page.getByRole('button', { name: /^Provider .*model/ })).toBeVisible()
  await expect(node).toHaveCount(0)
})
