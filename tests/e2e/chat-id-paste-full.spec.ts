import { expect, test } from '@playwright/test'
import { registerAgentTestUser } from './helpers/agent-user'

const api = process.env.API_URL || 'http://127.0.0.1:8100'

test('first clipboard paste in a new chat becomes a reference', async ({ page, request, context }) => {
  const token = await registerAgentTestUser(request, api, `paste-${Date.now()}`, 'paste-test-password')
  const headers = { Authorization: `Bearer ${token}` }
  const source = await (await request.post(`${api}/api/sessions`, { headers, data: { name: 'Source chat' } })).json() as { id: string }
  await context.addCookies([{ name: 'jait_token', value: token, url: api, httpOnly: true, sameSite: 'Lax' }])
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.addInitScript(({ token, api }) => {
    localStorage.setItem('jait-auth-token', token)
    sessionStorage.setItem('jait-auth-token', token)
    localStorage.setItem('jait-gateway-url', api)
  }, { token, api })
  await page.goto(`/?sessionId=${source.id}`)
  const editor = page.locator('[role="textbox"][contenteditable="true"]').first()
  await expect(editor).toBeVisible({ timeout: 45000 })
  await page.getByRole('button', { name: 'New chat', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Open here' }).click()
  await expect(editor).toBeVisible()
  await page.evaluate(id => navigator.clipboard.writeText(id), source.id)
  await editor.click()
  await page.keyboard.press('Control+V')
  await expect(editor.locator(`[data-chat-id="${source.id}"]`)).toHaveCount(1, { timeout: 10000 })
})
