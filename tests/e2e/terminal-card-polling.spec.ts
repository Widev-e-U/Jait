import { test, expect } from '@playwright/test'

test('pending and waiting background terminals use events instead of polling', async ({ page }) => {
  let snapshotRequests = 0
  await page.route('**/api/terminals', route => {
    snapshotRequests += 1
    return route.fulfill({ json: { terminals: [{
      id: 'terminal-repro-pty', type: 'terminal', state: 'running',
      sessionId: 'terminal-repro', projectRoot: null,
      metadata: { toolExecution: {
        actionId: 'different-gateway-action', command: 'bun run test',
        startedAt: new Date().toISOString(), completedAt: null,
        outputOffset: 12, outputEndOffset: null, isBackground: true, watched: true,
      } },
    }] } })
  })
  await page.routeWebSocket('**', () => {})
  await page.goto('/terminal-card-repro.html')
  await page.waitForFunction(() => typeof Reflect.get(window, '__announceTerminalBinding') === 'function')
  await expect.poll(() => snapshotRequests).toBe(1)
  await page.waitForTimeout(1800)
  expect(snapshotRequests).toBe(1)
  await page.evaluate(() => Reflect.get(window, '__announceTerminalBinding')(true))
  await expect(page.getByText('background · waiting', { exact: true })).toBeVisible()
  await expect.poll(() => snapshotRequests).toBe(2)
  await page.waitForTimeout(1800)
  expect(snapshotRequests).toBe(2)
})
