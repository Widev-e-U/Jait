import { describe, expect, it } from 'vitest'
import { AuditWriter } from '../services/audit.js'
import { createServer } from '../server.js'
import { loadConfig } from '../config.js'
import { openDatabase, migrateDatabase } from '../db/index.js'
import { signAuthToken } from '../security/http-auth.js'
import { SessionService } from '../services/sessions.js'
import { ProjectService } from '../services/projects.js'
import { UserService } from '../services/users.js'

function loop(status: 'running' | 'waiting' | 'paused' | 'completed' | 'error') {
  return { loop: { id: 'goal', goal: 'Fix it', criteria: ['Pass'], status, iteration: 2, revision: 4,
    checkedIteration: 1, summary: '', nextMessage: '', evidence: [], updatedAt: '2026-01-01T00:00:00.000Z' } }
}

describe('unread chat count', () => {
  it('includes all active projects and personal chats, scoped by owner and loop state', async () => {
    const { db, sqlite } = await openDatabase(':memory:')
    migrateDatabase(sqlite)
    const config = { ...loadConfig(), port: 0, wsPort: 0, nodeEnv: 'test', logLevel: 'silent' }
    const userService = new UserService(db)
    const owner = userService.createUser('unread-owner', 'password123')
    const other = userService.createUser('unread-other', 'password123')
    const sessionService = new SessionService(db)
    const projectService = new ProjectService(db)
    const makeUnread = (id: string) => sqlite.prepare(
      'UPDATE sessions SET created_at = ?, viewed_at = ?, last_active_at = ? WHERE id = ?',
    ).run('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z', id)
    const personal = sessionService.create({ userId: owner.id })
    makeUnread(personal.id)
    for (let i = 0; i < 7; i++) {
      const project = projectService.create({ userId: owner.id, title: `Project ${i}`, rootPath: `/work/${i}`, nodeId: 'gateway' })
      makeUnread(sessionService.create({ userId: owner.id, projectId: project.id }).id)
    }
    const running = sessionService.create({ userId: owner.id, metadata: loop('running') })
    const waiting = sessionService.create({ userId: owner.id, metadata: loop('waiting') })
    const archived = sessionService.create({ userId: owner.id })
    const deleted = sessionService.create({ userId: owner.id })
    const someoneElse = sessionService.create({ userId: other.id })
    for (const chat of [running, waiting, archived, deleted, someoneElse]) makeUnread(chat.id)
    sessionService.archive(archived.id)
    sessionService.delete(deleted.id)
    sessionService.create({ userId: owner.id }) // A new, already viewed chat.
    const app = await createServer(config, { db, sqlite, sessionService, projectService, userService, audit: new AuditWriter(db) })
    try {
      const token = await signAuthToken({ id: owner.id, username: owner.username }, config.jwtSecret)
      const headers = { authorization: `Bearer ${token}` }
      const getCount = async () => (await app.inject({ method: 'GET', url: '/api/sessions/unread-count', headers })).json().count
      expect((await app.inject({ method: 'GET', url: '/api/sessions/unread-count' })).statusCode).toBe(401)
      expect(await getCount()).toBe(9) // One personal, seven projects, and one waiting loop.
      sessionService.update(running.id, { metadata: loop('completed') }, owner.id)
      expect(await getCount()).toBe(10)
      const viewed = await app.inject({ method: 'POST', url: `/api/sessions/${running.id}/viewed`, headers,
        payload: { lastActiveAt: '2026-01-02T00:00:00.000Z' } })
      expect(viewed.statusCode).toBe(200)
      expect(await getCount()).toBe(9)
    } finally {
      await app.close()
      sqlite.close()
    }
  })
})
