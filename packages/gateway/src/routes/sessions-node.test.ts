import { describe, expect, it, vi } from 'vitest'
import { AuditWriter } from "../services/audit.js";
import { createServer } from '../server.js'
import { loadConfig } from '../config.js'
import { openDatabase, migrateDatabase } from '../db/index.js'
import { signAuthToken } from '../security/http-auth.js'
import { SessionService } from '../services/sessions.js'
import { ProjectService } from '../services/projects.js'
import { UserService } from '../services/users.js'
import type { WsControlPlane } from '../ws.js'

describe('personal chat node API', () => {
  it('persists valid devices, preserves preferences and enforces ownership and project location', async () => {
    const { db, sqlite } = await openDatabase(':memory:')
    migrateDatabase(sqlite)
    const config = { ...loadConfig(), port: 0, wsPort: 0, nodeEnv: 'test', logLevel: 'silent' }
    const userService = new UserService(db)
    const owner = userService.createUser('chat-node-owner', 'password123')
    const other = userService.createUser('chat-node-other', 'password123')
    const sessionService = new SessionService(db)
    const projectService = new ProjectService(db)
    const session = sessionService.create({ userId: owner.id })
    sessionService.updateChatSelection(session.id, { provider: 'codex', model: 'model-a' }, owner.id)
    const project = projectService.create({ userId: owner.id, title: 'Project', rootPath: '/work/project', nodeId: 'gateway' })
    const projectChat = sessionService.create({ userId: owner.id, projectId: project.id })
    const ws = { canAccessNode: (_id: string, userId: string | null) => userId === owner.id, getFsNodes: () => [{ id: 'node-a', name: 'Node A', isGateway: false }], broadcast: vi.fn(), broadcastToUser: vi.fn(), registerGatewayFsNode: vi.fn() } as unknown as WsControlPlane
    const app = await createServer(config, { db, sqlite, sessionService, projectService, userService, ws, audit: new AuditWriter(db) })
    try {
      const token = await signAuthToken({ id: owner.id, username: owner.username }, config.jwtSecret)
      const headers = { authorization: `Bearer ${token}` }
      const patch = (id: string, nodeId: unknown) => app.inject({ method: 'PATCH', url: `/api/sessions/${id}`, headers, payload: { nodeId } })
      expect((await patch(session.id, 'node-a')).statusCode).toBe(200)
      const saved = (await app.inject({ method: 'GET', url: `/api/sessions/${session.id}`, headers })).json()
      expect(JSON.parse(saved.metadata).chat).toEqual({ nodeId: 'node-a', provider: 'codex', model: 'model-a' })
      for (const value of ['', null, 5, 'missing-device']) expect((await patch(session.id, value)).statusCode).toBe(400)
      expect(JSON.parse(sessionService.getById(session.id)!.metadata!).chat.nodeId).toBe('node-a')
      expect((await patch(projectChat.id, 'node-a')).json().error).toBe('PROJECT_NODE_FIXED')
      const otherToken = await signAuthToken({ id: other.id, username: other.username }, config.jwtSecret)
      const denied = await app.inject({ method: 'PATCH', url: `/api/sessions/${session.id}`, headers: { authorization: `Bearer ${otherToken}` }, payload: { nodeId: 'gateway' } })
      expect(denied.statusCode).toBe(404)
      ws.canAccessNode = () => false
      expect((await patch(session.id, 'node-a')).statusCode).toBe(404)
      expect(JSON.parse(sessionService.getById(session.id)!.metadata!).chat.nodeId).toBe('node-a')
      expect((await patch(session.id, 'gateway')).statusCode).toBe(200)
    } finally {
      await app.close()
      sqlite.close()
    }
  })
})
