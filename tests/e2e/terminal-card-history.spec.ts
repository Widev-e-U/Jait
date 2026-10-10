import { test, expect } from '@playwright/test'

test('completed output replays without a live terminal or polling', async ({ page }) => {
  let subscriptions = 0
  await page.route('**/api/terminals', route => route.fulfill({ json: { terminals: [{
    id: 'unrelated-terminal', type: 'terminal', state: 'running',
    sessionId: 'terminal-repro', projectRoot: null,
    metadata: { toolExecution: {
      command: 'different command', actionId: 'unrelated-call',
      startedAt: new Date().toISOString(), completedAt: null,
      outputOffset: 99, outputEndOffset: null, isBackground: false, watched: null,
    } },
  }] } }))
  await page.routeWebSocket('**', socket => {
    socket.onMessage(raw => {
      if (JSON.parse(String(raw)).type === 'terminal.subscribe') subscriptions += 1
    })
  })
  await page.goto('/terminal-card-repro.html')
  await page.waitForFunction(() => typeof Reflect.get(window, '__finishTerminalCommand') === 'function')
  await page.evaluate(() => Reflect.get(window, '__finishTerminalCommand')())
  await page.getByRole('button', { expanded: false }).first().click()
  await expect(page.locator('.xterm-rows')).toContainText('LIVE FIRST LINE')
  await expect(page.locator('.xterm-rows')).toContainText('LIVE SECOND LINE')
  expect(subscriptions).toBe(0)
})
