import { describe, expect, it } from 'vitest'
import { AuditWriter } from '../services/audit.js'
import { createServer } from '../server.js'
import { loadConfig } from '../config.js'
import { openDatabase, migrateDatabase } from '../db/index.js'
import { signAuthToken } from '../security/http-auth.js'
import { SessionService } from '../services/sessions.js'
import { ProjectService } from '../services/projects.js'
import { UserService } from '../services/users.js'

describe('personal chat listing', () => {
  it('keeps old personal chats despite newer project chats and scopes by owner and status', async () => {
    const { db, sqlite } = await openDatabase(':memory:')
    migrateDatabase(sqlite)
    const config = { ...loadConfig(), port: 0, wsPort: 0, nodeEnv: 'test', logLevel: 'silent' }
    const userService = new UserService(db)
    const owner = userService.createUser('personal-owner', 'password123')
    const other = userService.createUser('personal-other', 'password123')
    const sessionService = new SessionService(db)
    const projectService = new ProjectService(db)
    const personal = Array.from({ length: 105 }, (_, i) => sessionService.create({ userId: owner.id, name: `Personal ${i}` }))
    const project = projectService.create({ userId: owner.id, title: 'Busy project', rootPath: '/work/project', nodeId: 'gateway' })
    for (let i = 0; i < 100; i++) {
      const chat = sessionService.create({ userId: owner.id, projectId: project.id })
      sqlite.prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?').run('2099-01-01T00:00:00.000Z', chat.id)
    }
    sessionService.create({ userId: other.id })
    const archived = sessionService.create({ userId: owner.id })
    sessionService.archive(archived.id)
    const app = await createServer(config, { db, sqlite, sessionService, projectService, userService, audit: new AuditWriter(db) })
    try {
      const token = await signAuthToken({ id: owner.id, username: owner.username }, config.jwtSecret)
      const headers = { authorization: `Bearer ${token}` }
      // The former sidebar query loses all 105 personal chats behind project activity.
      const oldPage = await app.inject({ method: 'GET', url: '/api/sessions?status=active&limit=100', headers })
      expect(oldPage.json().sessions.filter((s: { projectId: string | null }) => !s.projectId)).toHaveLength(0)
      const result = await app.inject({ method: 'GET', url: '/api/sessions?status=active&personal=true', headers })
      expect(result.statusCode).toBe(200)
      expect(result.json().sessions.map((s: { id: string }) => s.id).sort()).toEqual(personal.map(s => s.id).sort())
      expect(result.json().hasMore).toBe(false)
      const limited = await app.inject({ method: 'GET', url: '/api/sessions?status=active&personal=true&limit=20', headers })
      expect(limited.json().sessions).toHaveLength(20)
      expect(limited.json().sessions.every((s: { projectId: string | null }) => s.projectId === null)).toBe(true)
      expect(limited.json().hasMore).toBe(true)
      const all = await app.inject({ method: 'GET', url: '/api/sessions?status=active&limit=100', headers })
      expect(all.json().sessions).toHaveLength(100)
      expect(all.json().sessions.every((s: { projectId: string | null }) => s.projectId === project.id)).toBe(true)
    } finally {
      await app.close()
      sqlite.close()
    }
  })
})
