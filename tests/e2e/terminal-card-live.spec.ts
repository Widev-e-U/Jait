import { test, expect, type WebSocketRoute } from '@playwright/test'

test('running MCP card mounts the live terminal and receives output before tool completion', async ({ page }) => {
  await page.route('**/api/terminals', route => route.fulfill({ json: { terminals: [] } }))
  let terminalSocket: WebSocketRoute | undefined
  let subscription: Record<string, unknown> | undefined
  await page.routeWebSocket('**', socket => {
    socket.onMessage(raw => {
      const message = JSON.parse(String(raw))
      if (message.type === 'terminal.subscribe') {
        terminalSocket = socket
        subscription = message
      }
    })
  })
  await page.goto('/terminal-card-repro.html')
  await page.waitForFunction(() => typeof Reflect.get(window, '__announceTerminalBinding') === 'function')
  await expect(page.locator('.xterm')).toHaveCount(0)
  await page.evaluate(() => Reflect.get(window, '__announceTerminalBinding')())
  await expect(page.locator('.xterm')).toBeVisible()
  await expect.poll(() => subscription).toMatchObject({ terminalId: 'terminal-repro-pty', outputOffset: 12 })
  expect(subscription).not.toHaveProperty('outputEndOffset')
  terminalSocket!.send(JSON.stringify({ payload: {
    type: 'terminal.output', terminalId: 'terminal-repro-pty', data: 'LIVE FIRST LINE\r\n',
    streamId: 'test-stream', seq: 1, outputOffset: 13,
  } }))
  await expect(page.locator('.xterm-rows')).toContainText('LIVE FIRST LINE')
  terminalSocket!.send(JSON.stringify({ payload: {
    type: 'terminal.output', terminalId: 'terminal-repro-pty', data: 'LIVE SECOND LINE\r\n',
    streamId: 'test-stream', seq: 2, outputOffset: 14,
  } }))
  await expect(page.locator('.xterm-rows')).toContainText('LIVE SECOND LINE')
})
