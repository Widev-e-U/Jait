import { registerTestUser } from './helpers/agent-user'
import { test, expect } from '@playwright/test'

const API_URL = process.env.API_URL || 'http://127.0.0.1:8100'

test('todos sort by creation date and remember the selection without replacing manual order', async ({ page, request }) => {
  test.setTimeout(90_000)
  const registration = await registerTestUser(request, API_URL, {
    data: { username: `todo-sort-${Date.now()}`, password: 'todo-sort-test-password' },
  })
  expect(registration.ok()).toBeTruthy()
  const { access_token: token } = await registration.json()
  await page.context().addCookies([{ name: 'jait_token', value: token, url: API_URL, httpOnly: true, sameSite: 'Lax' }])
  await page.addInitScript(({ token, api }) => {
    localStorage.setItem('jait-auth-token', token)
    sessionStorage.setItem('jait-auth-token', token)
    localStorage.setItem('token', token)
    localStorage.setItem('jait-gateway-url', api)
    if (!localStorage.getItem('jait.todo.order.v1')) {
      localStorage.setItem('jait.todo.order.v1', JSON.stringify({ 'sort-repo': ['middle', 'old', 'new'] }))
    }
  }, { token, api: API_URL })
  await page.route('**/api/repos', (route) => route.fulfill({ json: { repos: [
    { id: 'sort-repo', name: 'Sorting test', localPath: '/tmp/sort-repo', defaultBranch: 'main' },
  ] } }))
  await page.route('**/api/repos/sort-repo/todos', (route) => route.fulfill({ json: { todos: [
    { id: 'new', createdAt: '2026-10-03T12:00:00Z', status: 'open' },
    { id: 'old', createdAt: '2026-10-01T12:00:00Z', status: 'open' },
    { id: 'middle', createdAt: '2026-10-02T12:00:00Z', status: 'in_progress' },
  ].map((todo) => ({
    ...todo, repoId: 'sort-repo', message: todo.id, priority: 'normal', dueDate: null,
    tags: '[]', completionHistory: '[]', completedAt: null, sourceThreadId: null,
    sourceThreadTitle: null, updatedAt: '2026-10-04T12:00:00Z', userId: null,
  })) } }))

  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click()
  await page.getByRole('button', { name: 'Todo', exact: true }).click()
  const rows = page.locator('[data-todo-id]')
  const order = () => rows.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-todo-id')))
  await expect.poll(order).toEqual(['middle', 'old', 'new'])
  await page.getByRole('combobox', { name: 'Sort: Manual order' }).click()
  await page.getByRole('option', { name: 'Newest first' }).click()
  await expect.poll(order).toEqual(['new', 'middle', 'old'])
  await expect(page.getByLabel('Drag to reorder', { exact: true })).toHaveCount(0)
  await page.reload()
  await page.getByRole('button', { name: 'Todo', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Sort: Newest first' })).toBeVisible()
  await expect.poll(order).toEqual(['new', 'middle', 'old'])
  await page.getByRole('combobox', { name: 'Sort: Newest first' }).click()
  await page.getByRole('option', { name: 'Oldest first' }).click()
  await expect.poll(order).toEqual(['old', 'middle', 'new'])
  await page.getByPlaceholder('Search todos by text, tag, status, date...').fill('middle')
  await expect.poll(order).toEqual(['middle'])
  await page.getByPlaceholder('Search todos by text, tag, status, date...').fill('')
  await page.getByRole('combobox', { name: 'Sort: Oldest first' }).click()
  await page.getByRole('option', { name: 'Manual order' }).click()
  await expect.poll(order).toEqual(['middle', 'old', 'new'])
  await expect(page.getByLabel('Drag to reorder', { exact: true })).toHaveCount(3)

  const handle = rows.first().getByLabel('Drag to reorder', { exact: true })
  const handleBox = await handle.boundingBox()
  const secondBox = await rows.nth(1).boundingBox()
  const lastBox = await rows.nth(2).boundingBox()
  if (!handleBox || !secondBox || !lastBox) throw new Error('Todo rows are not visible')
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(handleBox.x + handleBox.width / 2, secondBox.y + secondBox.height * 0.75, { steps: 5 })
  await expect.poll(order).toEqual(['old', 'middle', 'new'])
  await page.mouse.move(handleBox.x + handleBox.width / 2, lastBox.y + lastBox.height * 0.9, { steps: 5 })
  await expect.poll(order).toEqual(['old', 'new', 'middle'])
  await page.mouse.up()
  await expect.poll(order).toEqual(['old', 'new', 'middle'])
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('jait.todo.order.v1') || '{}')['sort-repo'])).toEqual(['old', 'new', 'middle'])
  await page.reload()
  await page.getByRole('button', { name: 'Todo', exact: true }).click()
  await expect.poll(order).toEqual(['old', 'new', 'middle'])
})

test('todo pagination keeps selection on its page and resets when filtering on mobile', async ({ page, request }) => {
  const registration = await registerTestUser(request, API_URL, {
    data: { username: `todo-pages-${Date.now()}`, password: 'todo-pages-test-password' },
  })
  expect(registration.ok()).toBeTruthy()
  const { access_token: token } = await registration.json()
  await page.context().addCookies([{ name: 'jait_token', value: token, url: API_URL, httpOnly: true, sameSite: 'Lax' }])
  await page.addInitScript(({ token, api }) => {
    localStorage.setItem('jait-auth-token', token)
    sessionStorage.setItem('jait-auth-token', token)
    localStorage.setItem('token', token)
    localStorage.setItem('jait-gateway-url', api)
  }, { token, api: API_URL })
  await page.route('**/api/repos', (route) => route.fulfill({ json: { repos: [
    { id: 'pages-repo', name: 'Pagination test', localPath: '/tmp/pages-repo', defaultBranch: 'main' },
  ] } }))
  await page.route('**/api/repos/pages-repo/todos', (route) => route.fulfill({ json: { todos: Array.from({ length: 23 }, (_, index) => ({
    id: `item-${index}`, repoId: 'pages-repo', message: `Task ${index}`, priority: 'normal', status: 'open', dueDate: null,
    tags: '[]', completionHistory: '[]', completedAt: null, sourceThreadId: null, sourceThreadTitle: null,
    createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-01T12:00:00Z', userId: null,
  })) } }))
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click()
  await page.getByRole('button', { name: 'Todo', exact: true }).click()
  await page.setViewportSize({ width: 375, height: 812 })
  const rows = page.locator('[data-todo-id]')
  await expect(rows).toHaveCount(20)
  await page.getByText('Select page', { exact: true }).click()
  await expect(page.getByText('20 selected in view')).toBeVisible()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(rows).toHaveCount(3)
  await expect(page.getByText('Page 2 of 2')).toBeVisible()
  await expect(page.getByText('Select page', { exact: true })).toBeVisible()
  await page.getByPlaceholder('Search todos by text, tag, status, date...').fill('Task 22')
  await expect(rows).toHaveCount(1)
  await expect(page.getByText('Page 1 of 1')).toBeVisible()
  await expect(rows.first()).toHaveAttribute('data-todo-id', 'item-22')
})
