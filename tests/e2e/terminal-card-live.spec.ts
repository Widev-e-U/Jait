import { test, expect, type WebSocketRoute } from '@playwright/test'

test('running MCP card mounts the live terminal and receives output before tool completion', async ({ page }) => {
  let snapshotRequests = 0
  await page.route('**/api/terminals', route => {
    snapshotRequests += 1
    return route.fulfill({ json: { terminals: [] } })
  })
  let terminalSocket: WebSocketRoute | undefined
  let subscription: Record<string, unknown> | undefined
  let subscriptions = 0
  const inputMessages: string[] = []
  await page.routeWebSocket('**', socket => {
    socket.onMessage(raw => {
      const message = JSON.parse(String(raw))
      if (message.type === 'terminal.input') inputMessages.push(String(raw))
      if (message.type === 'terminal.subscribe') {
        terminalSocket = socket
        subscription = message
        subscriptions += 1
        if (subscriptions > 1) {
          socket.send(JSON.stringify({ type: 'terminal.output', payload: {
            type: 'terminal.output', terminalId: 'terminal-repro-pty',
            data: '$ bun run test\r\nLIVE FIRST LINE\r\nLIVE SECOND LINE\r\n',
            streamId: 'test-stream', seq: 2, outputOffset: 14, replay: true,
          } }))
        }
      }
    })
  })
  await page.goto('/terminal-card-repro.html')
  await page.waitForFunction(() => typeof Reflect.get(window, '__announceTerminalBinding') === 'function')
  await expect(page.locator('.xterm')).toBeVisible()
  await expect(page.locator('.xterm-rows')).toContainText('$ bun')
  const terminalElement = await page.locator('.xterm').elementHandle()
  await page.evaluate(() => Reflect.get(window, '__streamTerminalCommand')('bun run test'))
  await expect(page.locator('.xterm-rows')).toContainText('$ bun run test')
  await page.evaluate(() => Reflect.get(window, '__announceTerminalBinding')())
  expect(await terminalElement!.evaluate(element => element.isConnected)).toBe(true)
  await expect(page.locator('.xterm')).toBeVisible()
  await expect.poll(() => subscription).toMatchObject({ terminalId: 'terminal-repro-pty', outputOffset: 12 })
  expect(subscription).not.toHaveProperty('outputEndOffset')
  terminalSocket!.send(JSON.stringify({ type: 'terminal.output', payload: { type: 'terminal.output', terminalId: 'terminal-repro-pty', data: 'LIVE FIRST LINE\r\n',
    streamId: 'test-stream', seq: 1, outputOffset: 13,
  } }))
  await expect(page.locator('.xterm-rows')).toContainText('LIVE FIRST LINE')
  terminalSocket!.send(JSON.stringify({ type: 'terminal.output', payload: { type: 'terminal.output', terminalId: 'terminal-repro-pty', data: 'LIVE SECOND LINE\r\n',
    streamId: 'test-stream', seq: 2, outputOffset: 14,
  } }))
  await expect(page.locator('.xterm-rows')).toContainText('LIVE SECOND LINE')
  expect(await terminalElement!.evaluate(element => element.isConnected)).toBe(true)
  expect(subscriptions).toBe(1)
  expect(inputMessages).toEqual([])
  // The transport may reconnect, while the authored/live renderer stays put.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(() => subscriptions).toBe(2)
  await expect(page.locator('.xterm-rows')).toContainText('LIVE SECOND LINE')
  expect(await terminalElement!.evaluate(element => element.isConnected)).toBe(true)
  expect((await page.locator('.xterm-rows').innerText()).match(/LIVE FIRST LINE/g)).toHaveLength(1)
  await page.evaluate(() => Reflect.get(window, '__finishTerminalCommand')())
  await expect.poll(() => subscription).toMatchObject({ outputEndOffset: 14 })
  // Completed cards retain the existing automatic collapse behavior.
  await page.getByRole('button', { expanded: false }).first().click()
  await expect(page.locator('.xterm')).toBeVisible()
  await expect(page.locator('.xterm-rows')).toContainText('LIVE SECOND LINE')
  const requestsAfterExecution = snapshotRequests
  await page.waitForTimeout(1800)
  expect(snapshotRequests).toBe(requestsAfterExecution)
})
