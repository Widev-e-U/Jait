import { test, expect, type Page } from '@playwright/test'

async function openStream(page: Page) {
  await page.goto('/chat-stream-latency-repro.html')
  await expect(page.getByTestId('history-loading')).toHaveText('false')
  await expect(page.getByTestId('assistant-content')).toHaveText('partial')
  // Control only paint scheduling; the actual SSE reader, hook and renderer run.
  await page.evaluate(() => {
    const frames = new Map<number, FrameRequestCallback>()
    let nextId = 0
    window.requestAnimationFrame = (callback) => {
      frames.set(++nextId, callback)
      return nextId
    }
    window.cancelAnimationFrame = (id) => { frames.delete(id) }
    Reflect.set(window, '__paintStreamFrame', () => {
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach(callback => callback(performance.now()))
    })
  })
}

async function send(page: Page, events: Record<string, unknown>[]) {
  await page.evaluate(async (packets) => {
    const controllers = Reflect.get(window, '__resumeStreamControllers') as ReadableStreamDefaultController<Uint8Array>[]
    controllers.at(-1)!.enqueue(new TextEncoder().encode(
      packets.map(packet => `data: ${JSON.stringify(packet)}\n\n`).join(''),
    ))
    // Let fetch and React tasks run, without allowing another animation frame.
    await new Promise(resolve => setTimeout(resolve, 20))
  }, events)
}

async function paint(page: Page) {
  await page.evaluate(async () => {
    Reflect.get(window, '__paintStreamFrame')()
    await new Promise(resolve => setTimeout(resolve, 20))
  })
}

test('a received burst is fully rendered after one frame, without replaying it', async ({ page }) => {
  await openStream(page)
  const burst = 'incoming '.repeat(300)
  await send(page, [{ type: 'token', content: burst }])
  await paint(page)
  // No polling: a later deadline/frame must not conceal a replay backlog.
  expect((await page.getByTestId('assistant-content').textContent())?.length).toBe('partial'.length + burst.length)
  expect(await page.getByTestId('rendered-assistant').innerText()).toContain('partial' + burst.trimEnd())
})

test('tool cards and specialist output are not held behind prose, and retain a short fade', async ({ page }) => {
  await openStream(page)
  await send(page, [
    { type: 'mode_notice', message: 'Running in Swarm mode '.repeat(100) },
    { type: 'tool_start', call_id: 'agent-call', tool: 'agent', args: { prompt: 'Do the work', description: 'Developer' } },
    { type: 'tool_output', call_id: 'agent-call', content: 'specialist live prose', channel: 'text' },
  ])
  await paint(page)
  const state = JSON.parse((await page.getByTestId('assistant-state').textContent())!)
  expect(state.toolCalls[0].childSegments).toContainEqual({ type: 'text', content: 'specialist live prose' })
  const card = page.getByTestId('rendered-assistant').locator('.chat-message-part-reveal').last()
  await expect(card).toBeVisible()
  const animation = await card.evaluate(el => ({
    name: getComputedStyle(el).animationName,
    duration: getComputedStyle(el).animationDuration,
    delay: getComputedStyle(el).animationDelay,
  }))
  expect(animation).toEqual({ name: 'jait-reveal-fade', duration: '0.16s', delay: '0s' })
})

test('thinking, text and tools retain event order in one frame', async ({ page }) => {
  await openStream(page)
  await send(page, [
    { type: 'thinking', content: 'reason '.repeat(100) },
    { type: 'token', content: 'before tool' },
    { type: 'tool_start', call_id: 'read-1', tool: 'file.read', args: { path: 'README.md' } },
    { type: 'tool_result', call_id: 'read-1', ok: true, message: 'read complete' },
    { type: 'token', content: 'after tool '.repeat(100) },
  ])
  await paint(page)
  const state = JSON.parse((await page.getByTestId('assistant-state').textContent())!)
  expect(state.segments.map((s: { type: string }) => s.type)).toEqual(['text', 'thinking', 'text', 'toolGroup', 'text'])
  expect(state.segments.at(-1).content).toBe('after tool '.repeat(100))
  expect(state.thinking).toBe('reason '.repeat(100))
})

test('completion and rollback consume pending text even before a paint', async ({ page }) => {
  await openStream(page)
  await send(page, [
    { type: 'token', content: ' discarded'.repeat(100) },
    { type: 'content_rollback', contentLength: 7 },
    { type: 'token', content: ' kept' },
    { type: 'done' },
  ])
  expect(await page.getByTestId('assistant-content').textContent()).toBe('partial kept')
  expect(await page.getByTestId('loading').textContent()).toBe('false')
  await paint(page)
  expect(await page.getByTestId('assistant-content').textContent()).toBe('partial kept')
})
