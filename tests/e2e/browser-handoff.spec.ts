import { test, expect } from '@playwright/test'
import path from 'node:path'

const shots = path.resolve(__dirname, '../../.jait/shots')

for (const choice of ['Done', "I'm not able to do it", 'Another reason']) {
  test(`browser handoff waits inline and submits ${choice}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    let shared = true
    let submitted: unknown = null
    const request = {
      id: 'handoff-request', sessionId: 'chat-fixture', requestedBy: 'browser.handoff',
      title: 'Waiting for you in the browser', attention: 'normal', status: 'pending', expiresAt: null,
      questions: [{
        id: 'browser', header: 'Browser', question: 'Please enter your password in the browser and sign in.',
        allowFreeformInput: true, options: [{ label: 'Done' }, { label: "I'm not able to do it" }],
      }],
    }
    const session = () => ({
      sessionId: 'chat-fixture', browserId: 'browser-chat-fixture', status: 'ready',
      url: '/noVNC/vnc_lite.html?path=api/live-view/6080/websockify', sharedWithAgent: shared,
    })
    let deliver: (() => void) | undefined
    await page.routeWebSocket('**', socket => {
      deliver = () => {
        shared = false
        socket.send(JSON.stringify({ type: 'user-question.requested', payload: request }))
      }
    })
    await page.route('**/api/user-questions/requests', route => route.fulfill({ json: { requests: [] } }))
    await page.route('**/api/user-questions/requests/handoff-request/submit', route => {
      submitted = route.request().postDataJSON()
      shared = choice === 'Done'
      return route.fulfill({ json: { ok: true } })
    })
    await page.route('**/api/preview/session/chat-fixture', route => route.fulfill({ json: { session: session() } }))
    await page.route('**/api/preview/access', route => route.fulfill({ json: { url: route.request().postDataJSON().source } }))
    await page.route('**/noVNC/**', route => route.fulfill({
      contentType: 'text/html',
      body: '<body style="background:#e0f2fe"><p>Browser sign in</p><input type="password" aria-label="Browser password"></body>',
    }))
    await page.goto('/chat-browser-repro.html?handoff=1')
    const panel = page.getByRole('region', { name: 'Chat browser', exact: true })
    await panel.getByRole('button', { name: 'Minimize browser' }).click()
    await expect(panel).toHaveAttribute('data-browser-minimized', 'true')
    await expect.poll(() => Boolean(deliver)).toBe(true)
    deliver!()
    const prompt = page.getByTestId('browser-handoff-prompt')
    await expect(prompt).toContainText('Please enter your password in the browser and sign in.')
    await expect(prompt.getByRole('textbox')).toHaveCount(0)
    await expect(panel).toHaveAttribute('data-browser-minimized', 'false')
    await expect(panel.getByRole('button', { name: 'Share with agent', exact: true })).toBeVisible()
    expect(submitted).toBeNull()
    const header = page.getByRole('button', { name: 'Waiting for you in the browser', exact: true })
    const dockBox = (await page.locator('[data-chat-composer-dock]').boundingBox())!
    const collapseBox = (await header.boundingBox())!
    expect(Math.abs(collapseBox.x + collapseBox.width / 2 - dockBox.x - dockBox.width / 2)).toBeLessThanOrEqual(1)
    await header.click()
    await expect(header).toHaveAttribute('aria-expanded', 'false')
    await expect(prompt).toBeHidden()
    expect(submitted).toBeNull()
    await expect(page.getByRole('textbox', { name: 'Chat draft' })).toHaveValue('Keep my draft')
    await header.click()
    await expect(header).toHaveAttribute('aria-expanded', 'true')
    await expect(prompt).toBeVisible()
    await page.screenshot({ path: path.join(shots, `browser-handoff-${choice === 'Done' ? 'done' : choice === 'Another reason' ? 'reason' : 'unable'}.png`) })
    // One tap submits the action directly; there is no extra Q&A Submit step.
    await prompt.getByRole('button', { name: choice, exact: true }).click()
    if (choice === 'Another reason') {
      expect(submitted).toBeNull()
      await prompt.getByRole('textbox', { name: 'Why the browser step did not work' }).fill('The login page never loads')
      await prompt.getByRole('button', { name: 'Send reason' }).click()
    }
    await expect(prompt).toBeHidden()
    expect(submitted).toEqual({ answers: { browser: { selected: [choice], freeText: choice === 'Another reason' ? 'The login page never loads' : null, skipped: false } } })
    await expect(panel.getByRole('button', { name: choice === 'Done' ? 'Take control' : 'Share with agent', exact: true })).toBeVisible()
    await expect(page.getByRole('textbox', { name: 'Chat draft' })).toHaveValue('Keep my draft')
  })
}

test('agent clicks visibly move the cursor before activating the target', async ({ page }) => {
  const { clickWithVisibleCursor } = await import('../../packages/gateway/src/surfaces/browser-cursor.cjs')
  await page.route('**/cursor-fixture', route => route.fulfill({ contentType: 'text/html', body: `
    <button style="margin:160px;width:120px;height:60px" onclick="window.clicked = true">Continue</button>
    <script>window.moves = []; document.addEventListener('mousemove', event => window.moves.push([event.clientX, event.clientY]));</script>
  ` }))
  await page.goto('/cursor-fixture')
  await clickWithVisibleCursor(page, 'button')
  expect(await page.evaluate(() => Reflect.get(window, 'clicked'))).toBe(true)
  expect(await page.evaluate(() => Reflect.get(window, 'moves').length)).toBeGreaterThanOrEqual(10)
  await expect(page.locator('#__jait_agent_cursor__')).toBeVisible()
  const cursor = (await page.locator('#__jait_agent_cursor__').boundingBox())!
  const target = (await page.getByRole('button', { name: 'Continue' }).boundingBox())!
  expect(Math.abs(cursor.x - target.x - target.width / 2)).toBeLessThan(1)
  expect(Math.abs(cursor.y - target.y - target.height / 2)).toBeLessThan(1)
  await page.screenshot({ path: path.join(shots, 'browser-agent-cursor.png') })
  await page.evaluate(() => { Reflect.set(window, 'clicked', false) })
  const controller = new AbortController()
  controller.abort()
  await expect(clickWithVisibleCursor(page, 'button', controller.signal)).rejects.toThrow('Cancelled')
  expect(await page.evaluate(() => Reflect.get(window, 'clicked'))).toBe(false)
})
