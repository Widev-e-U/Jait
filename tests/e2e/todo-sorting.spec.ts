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
    localStorage.setItem('jait.todo.order.v1', JSON.stringify({ 'sort-repo': ['middle', 'old', 'new'] }))
  }, { token, api: API_URL })
  await page.route('**/api/repos', (route) => route.fulfill({ json: { repos: [
    { id: 'sort-repo', name: 'Sorting test', localPath: '/tmp/sort-repo', defaultBranch: 'main' },
  ] } }))
  await page.route('**/api/repos/sort-repo/todos', (route) => route.fulfill({ json: { todos: [
    { id: 'new', createdAt: '2026-10-03T12:00:00Z', status: 'done' },
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
})
