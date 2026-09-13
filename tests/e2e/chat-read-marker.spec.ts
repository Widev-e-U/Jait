import path from 'node:path'
import { expect, test } from '@playwright/test'

const initial = '2026-09-13T10:00:00.000Z'
const replyTime = '2026-09-13T10:01:00.000Z'

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    const session = (id: string, projectId: string | null) => ({
      id, projectId, name: id, createdAt: initial, lastActiveAt: initial, viewedAt: null,
    })
    const personal = session('personal-1', null)
    const projectChat = session('project-chat', 'project-1')
    const project = { id: 'project-1', title: 'Project', sessions: [projectChat] }
    if (path.endsWith('/messages')) return route.fulfill({ json: {
      messages: [{ id: 'reply-1', role: 'assistant', content: 'Initial answer' }],
      total: 1, streaming: false, lastActiveAt: initial, seq: 0,
    } })
    if (path.endsWith('/events')) return route.fulfill({ contentType: 'text/event-stream', body: 'data: {"type":"heartbeat"}\n\n' })
    if (path.endsWith('/viewed')) {
      const body = route.request().postDataJSON()
      return route.fulfill({ json: { ok: true, session: {
        ...session(path.split('/').at(-2)!, null), viewedAt: body?.lastActiveAt ?? initial,
      } } })
    }
    const json = path === '/api/projects/last-active' ? { project: null, session: personal }
      : path === '/api/projects' ? { projects: [project] }
      : path === '/api/sessions' ? { sessions: [personal] }
      : { ok: true }
    await route.fulfill({ json })
  })
  await page.goto(`/@fs${path.resolve(process.cwd(), 'fixtures/chat-read-marker.html')}`)
  await expect(page.getByTestId('active')).toHaveText('personal-1')
})

test('restored and project-selected chats acknowledge loaded content', async ({ page }) => {
  await expect(page.getByTestId('unread')).toHaveText('true')
  await page.getByText('Load transcript', { exact: true }).click()
  await expect(page.getByTestId('viewed')).toHaveText(initial)
  await page.getByText('Open project', { exact: true }).click()
  await expect(page.getByTestId('active')).toHaveText('project-chat')
  await expect(page.getByTestId('viewed')).toHaveText(initial)
})

test('clicking a chat while history is loading does not acknowledge unseen content', async ({ page }) => {
  const requests: string[] = []
  page.on('request', req => { if (req.url().endsWith('/viewed')) requests.push(req.url()) })
  await page.getByText('Open personal', { exact: true }).click()
  await page.waitForTimeout(400)
  expect(requests).toHaveLength(0)
})

test('new visible replies stay read; hidden panels wait until revealed', async ({ page }) => {
  await page.getByText('Load transcript', { exact: true }).click()
  await expect(page.getByTestId('viewed')).toHaveText(initial)
  await page.getByText('Toggle panel', { exact: true }).click()
  await page.getByText('Receive reply', { exact: true }).click()
  await page.waitForTimeout(400)
  await expect(page.getByTestId('viewed')).not.toHaveText(replyTime)
  await page.getByText('Toggle panel', { exact: true }).click()
  await expect(page.getByTestId('viewed')).toHaveText(replyTime)
  await expect(page.getByTestId('unread')).toHaveText('false')
})

test('a reader scrolled up must reach the latest content before acknowledging it', async ({ page }) => {
  await page.getByText('Long transcript', { exact: true }).click()
  await page.getByText('Load transcript', { exact: true }).click()
  await expect(page.getByTestId('viewed')).toHaveText(initial)
  const scroll = page.locator('[data-conversation-scroll]')
  await scroll.hover()
  await page.mouse.wheel(0, -2500)
  await expect.poll(() => scroll.evaluate(el => el.scrollTop)).toBe(0)
  await page.getByText('Receive reply', { exact: true }).click()
  await page.waitForTimeout(400)
  await expect(page.getByTestId('viewed')).not.toHaveText(replyTime)
  await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')) })
  await expect(page.getByTestId('viewed')).toHaveText(replyTime)
})

test('stale index responses cannot undo acknowledged content', async ({ page }) => {
  await page.getByText('Load transcript', { exact: true }).click()
  await expect(page.getByTestId('viewed')).toHaveText(initial)
  await page.getByText('Receive reply', { exact: true }).click()
  await expect(page.getByTestId('viewed')).toHaveText(replyTime)
  await page.getByText('Refresh index', { exact: true }).click()
  await expect(page.getByTestId('viewed')).toHaveText(replyTime)
})

test('background tabs acknowledge new content only when focused again', async ({ page }) => {
  await page.getByText('Load transcript', { exact: true }).click()
  await expect(page.getByTestId('viewed')).toHaveText(initial)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.getByText('Receive reply', { exact: true }).click()
  await page.waitForTimeout(400)
  await expect(page.getByTestId('viewed')).not.toHaveText(replyTime)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
  })
  await expect(page.getByTestId('viewed')).toHaveText(replyTime)
})

test('sidebar activity cannot acknowledge a reply before the transcript stream delivers it', async ({ page }) => {
  let release!: () => void
  const pendingReply = new Promise<void>(resolve => { release = resolve })
  await page.route('**/events', async route => {
    await pendingReply
    await route.fulfill({ contentType: 'text/event-stream', body: [
      { type: 'request', content: 'New prompt' },
      { type: 'token', content: 'Delivered reply' },
      { type: 'done', last_active_at: replyTime },
    ].map(event => `data: ${JSON.stringify(event)}\n\n`).join('') }).catch(() => {})
  })
  await page.goto(`/@fs${path.resolve(process.cwd(), 'fixtures/chat-read-marker.html')}?real=1`)
  await page.getByText('Load transcript', { exact: true }).click()
  await expect(page.getByTestId('viewed')).toHaveText(initial)
  await page.getByText('Receive reply', { exact: true }).click()
  await page.waitForTimeout(400)
  await expect(page.getByTestId('viewed')).toHaveText(initial)
  release()
  await expect(page.getByText(/Delivered reply/)).toBeVisible()
  await expect(page.getByTestId('viewed')).toHaveText(replyTime)
})
