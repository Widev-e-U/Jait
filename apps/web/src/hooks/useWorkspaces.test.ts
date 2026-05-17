import { describe, expect, it } from 'vitest'

import { getLatestWorkspaceSessionId, type WorkspaceForSessionSelection } from '@/lib/workspace-sessions'

function workspaceWithSessions(sessions: WorkspaceForSessionSelection['sessions']): WorkspaceForSessionSelection {
  return { sessions }
}

describe('getLatestWorkspaceSessionId', () => {
  it('selects the most recently active workspace chat', () => {
    expect(getLatestWorkspaceSessionId(workspaceWithSessions([
      {
        id: 'older-chat',
        createdAt: '2026-05-17T10:00:00.000Z',
        lastActiveAt: '2026-05-17T10:00:00.000Z',
      },
      {
        id: 'latest-chat',
        createdAt: '2026-05-17T09:00:00.000Z',
        lastActiveAt: '2026-05-17T11:00:00.000Z',
      },
    ]))).toBe('latest-chat')
  })

  it('returns null for workspaces without chats', () => {
    expect(getLatestWorkspaceSessionId(workspaceWithSessions([]))).toBeNull()
    expect(getLatestWorkspaceSessionId(null)).toBeNull()
  })
})
