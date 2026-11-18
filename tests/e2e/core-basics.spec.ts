import { test as base, expect, request as apiRequest, type APIRequestContext, type APIResponse } from '@playwright/test'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { registerTestUser } from './helpers/agent-user'

const API_URL = process.env.API_URL || 'http://127.0.0.1:8100'
const PASSWORD = 'core-basics-test-password'

const test = base.extend<{ api: APIRequestContext; username: string }>({
  username: async ({}, use) => { await use(`core-basics-${randomUUID()}`) },
  api: async ({ request, username }, use) => {
    const registration = await registerTestUser(request, API_URL, { data: { username, password: PASSWORD } })
    expect(registration.status()).toBe(200)
    const { access_token } = await registration.json()
    const api = await apiRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { Authorization: `Bearer ${access_token}` } })
    try { await use(api) } finally { await api.dispose() }
  },
})

async function json(response: APIResponse, status = 200) {
  expect(response.status(), await response.text()).toBe(status)
  return response.json()
}

test.describe('Core basics @smoke', () => {
  test('authentication rejects anonymous access and survives a fresh login', async ({ api, username }) => {
    const anonymous = await apiRequest.newContext({ baseURL: API_URL })
    try {
      for (const path of ['/api/sessions', '/api/jobs', '/api/repos', '/api/reminders']) {
        expect((await anonymous.get(path)).status(), path).toBe(401)
      }
      expect((await anonymous.post('/api/auth/login', { data: { username, password: 'incorrect-password' } })).status()).toBe(401)
      const login = await json(await anonymous.post('/api/auth/login', { data: { username, password: PASSWORD } }))
      const current = await json(await anonymous.get('/api/auth/me', { headers: { Authorization: `Bearer ${login.access_token}` } }))
      const original = await json(await api.get('/api/auth/me'))
      expect(current).toEqual(original)
    } finally { await anonymous.dispose() }
  })

  test('chat name, selection and UI state persist across independent requests', async ({ api }) => {
    const chat = await json(await api.post('/api/sessions', { data: { name: 'Home network investigation' } }), 201)
    try {
      await json(await api.patch(`/api/sessions/${chat.id}`, { data: { name: 'Router investigation — café', provider: 'jait', model: 'fixture-model' } }))
      await json(await api.patch(`/api/sessions/${chat.id}/state`, { data: { 'smoke.panel': { open: true, tab: 'terminal' } } }))
      expect(await json(await api.get(`/api/sessions/${chat.id}`))).toMatchObject({ name: 'Router investigation — café' })
      expect(await json(await api.get(`/api/sessions/${chat.id}/state?keys=smoke.panel`))).toEqual({ 'smoke.panel': { open: true, tab: 'terminal' } })
      expect((await json(await api.get('/api/sessions?status=active'))).sessions).toContainEqual(expect.objectContaining({ id: chat.id, name: 'Router investigation — café' }))
      const archived = await json(await api.post(`/api/sessions/${chat.id}/archive`))
      expect(archived.status).toBe('archived')
      expect((await json(await api.get('/api/sessions?status=active'))).sessions).not.toContainEqual(expect.objectContaining({ id: chat.id }))
    } finally { await api.delete(`/api/sessions/${chat.id}`) }
  })

  test('another user cannot read, rename, archive or delete a chat', async ({ api, request }) => {
    const chat = await json(await api.post('/api/sessions', { data: { name: 'Private investigation' } }), 201)
    const registration = await registerTestUser(request, API_URL, { data: { username: `core-outsider-${randomUUID()}`, password: PASSWORD } })
    const { access_token } = await json(registration)
    const outsider = await apiRequest.newContext({ baseURL: API_URL, extraHTTPHeaders: { Authorization: `Bearer ${access_token}` } })
    try {
      expect((await outsider.get(`/api/sessions/${chat.id}`)).status()).toBe(404)
      expect((await outsider.patch(`/api/sessions/${chat.id}`, { data: { name: 'Changed' } })).status()).toBe(404)
      expect((await outsider.post(`/api/sessions/${chat.id}/archive`)).status()).toBe(404)
      expect((await outsider.delete(`/api/sessions/${chat.id}`)).status()).toBe(404)
      expect((await json(await outsider.get('/api/sessions'))).sessions).not.toContainEqual(expect.objectContaining({ id: chat.id }))
      expect(await json(await api.get(`/api/sessions/${chat.id}`))).toMatchObject({ name: 'Private investigation', status: 'active' })
    } finally {
      await outsider.dispose()
      await api.delete(`/api/sessions/${chat.id}`)
    }
  })

  test('todos validate input, persist completion and can be reopened and removed', async ({ api }) => {
    const { repo } = await json(await api.post('/api/repos', { data: { name: 'Core smoke repository', localPath: resolve(__dirname, '../../.jait/artifacts', `smoke-repo-${randomUUID()}`) } }))
    try {
      expect((await api.post(`/api/repos/${repo.id}/todos`, { data: { message: '   ' } })).status()).toBe(400)
      const { todo } = await json(await api.post(`/api/repos/${repo.id}/todos`, { data: { message: 'Verify router TLS settings', priority: 'high', tags: ['security'], dueDate: '2030-01-15' } }), 201)
      const path = `/api/jait-todos/${todo.id}`
      expect((await api.patch(path, { data: { status: 'invalid-status' } })).status()).toBe(400)
      await json(await api.patch(path, { data: { status: 'done' } }))
      expect((await json(await api.get(`/api/repos/${repo.id}/todos`))).todos).toContainEqual(expect.objectContaining({ id: todo.id, status: 'done', priority: 'high', dueDate: '2030-01-15' }))
      await json(await api.patch(path, { data: { status: 'open' } }))
      expect((await json(await api.get(`/api/repos/${repo.id}/todos`))).todos).toContainEqual(expect.objectContaining({ id: todo.id, status: 'open' }))
      await json(await api.delete(path))
      expect((await json(await api.get(`/api/repos/${repo.id}/todos`))).todos).not.toContainEqual(expect.objectContaining({ id: todo.id }))
    } finally { await api.delete(`/api/repos/${repo.id}`) }
  })

  test('Memory page entries support edit, archive, restore, export and delete', async ({ api }) => {
    expect((await api.post('/api/reminders', { data: { content: '   ' } })).status()).toBe(400)
    const { reminder } = await json(await api.post('/api/reminders', { data: { content: 'Use the authorized gateway for verification', tags: ['Security', 'security'] } }), 201)
    const path = `/api/reminders/${reminder.id}`
    try {
      await json(await api.patch(path, { data: { content: 'Use the authorized LAN node for verification', status: 'archived' } }))
      expect((await json(await api.get('/api/reminders?status=active'))).reminders).not.toContainEqual(expect.objectContaining({ id: reminder.id }))
      expect((await json(await api.get('/api/reminders?status=archived'))).reminders).toContainEqual(expect.objectContaining({ id: reminder.id, content: 'Use the authorized LAN node for verification', status: 'archived' }))
      await json(await api.patch(path, { data: { status: 'active' } }))
      const exported = await api.get('/api/reminders/export.md')
      expect(exported.status()).toBe(200)
      expect(exported.headers()['content-type']).toContain('text/markdown')
      expect(await exported.text()).toContain('Use the authorized LAN node for verification')
      await json(await api.delete(path))
      expect((await json(await api.get('/api/reminders?status=all'))).reminders).not.toContainEqual(expect.objectContaining({ id: reminder.id }))
    } finally { await api.delete(path) }
  })

  test('disabled jobs validate schedules and persist edits without executing work', async ({ api }) => {
    expect((await api.post('/api/jobs', { data: { name: 'Invalid schedule', cron_expression: 'not-a-cron', enabled: false } })).status()).toBe(400)
    const job = await json(await api.post('/api/jobs', { data: { name: 'Core health review', cron_expression: '0 9 * * 1', job_type: 'system_job', tool_name: 'gateway.status', enabled: false } }), 201)
    const path = `/api/jobs/${job.id}`
    try {
      expect(await json(await api.get(path))).toMatchObject({ name: 'Core health review', enabled: false })
      expect((await api.patch(path, { data: { name: 'Rejected edit', cron_expression: 'not-a-cron', enabled: true } })).status()).toBe(400)
      expect(await json(await api.get(path))).toMatchObject({ name: 'Core health review', cron_expression: '0 9 * * 1', enabled: false })
      await json(await api.patch(path, { data: { name: 'Weekly health review', cron_expression: '0 10 * * 1' } }))
      expect(await json(await api.get(path))).toMatchObject({ name: 'Weekly health review', cron_expression: '0 10 * * 1', enabled: false })
      expect((await json(await api.get('/api/jobs?include_disabled=true'))).items).toContainEqual(expect.objectContaining({ id: job.id }))
      expect((await api.delete(path)).status()).toBe(204)
      expect((await api.get(path)).status()).toBe(404)
    } finally { await api.delete(path) }
  })
})
