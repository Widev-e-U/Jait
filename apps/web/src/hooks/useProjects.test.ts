import { describe, expect, it } from 'vitest'

import {
  applyPersonalSessionMove,
  applyProjectSessionMove,
  getMissingSelectedProjectId,
  prependProjectSession,
  type ProjectRecord,
  type ProjectSession,
} from '@/hooks/useProjects'
import { getLatestProjectSessionId, type ProjectForSessionSelection } from '@/lib/project-sessions'

function projectWithSessions(sessions: ProjectForSessionSelection['sessions']): ProjectForSessionSelection {
  return { sessions }
}

describe('getLatestProjectSessionId', () => {
  it('selects the most recently active project chat', () => {
    expect(getLatestProjectSessionId(projectWithSessions([
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

  it('returns null for projects without chats', () => {
    expect(getLatestProjectSessionId(projectWithSessions([]))).toBeNull()
    expect(getLatestProjectSessionId(null)).toBeNull()
  })
})

describe('getMissingSelectedProjectId', () => {
  it('prioritizes the project from a routed chat over the cached active project', () => {
    const listedProject = { id: 'listed-project' } as ProjectRecord

    expect(getMissingSelectedProjectId(
      [listedProject],
      'routed-project',
      null,
      'cached-project',
    )).toBe('routed-project')
  })
})

describe('prependProjectSession', () => {
  it('keeps one project chat when the WebSocket event arrives before the create response', () => {
    const session: ProjectSession = {
      id: 'new-chat',
      projectId: 'project-1',
      name: 'New Chat',
      projectPath: '/workspace/jait',
      status: 'active',
      createdAt: '2026-07-28T08:30:00.000Z',
      lastActiveAt: '2026-07-28T08:30:00.000Z',
      metadata: null,
    }

    const afterWebSocketEvent = prependProjectSession([], session)
    const afterCreateResponse = prependProjectSession(afterWebSocketEvent, session)

    expect(afterCreateResponse.map((entry) => entry.id)).toEqual(['new-chat'])
  })
})

describe('moving chats between projects', () => {
  function chat(id: string, projectId: string | null): ProjectSession {
    return {
      id,
      projectId,
      name: `Chat ${id}`,
      projectPath: projectId ? '/workspace/jait' : null,
      status: 'active',
      createdAt: '2026-08-01T08:00:00.000Z',
      lastActiveAt: '2026-08-01T08:00:00.000Z',
      viewedAt: null,
      metadata: null,
    }
  }

  function project(id: string, sessions: ProjectSession[]): ProjectRecord {
    return {
      id,
      title: id,
      rootPath: `/workspace/${id}`,
      nodeId: 'gateway',
      status: 'active',
      createdAt: '2026-08-01T08:00:00.000Z',
      lastActiveAt: '2026-08-01T08:00:00.000Z',
      metadata: null,
      sessions,
    }
  }

  it('moves a chat from one project to another without leaving a copy behind', () => {
    const moved = chat('chat-1', 'project-b')
    const next = applyProjectSessionMove(
      [project('project-a', [chat('chat-1', 'project-a'), chat('chat-2', 'project-a')]), project('project-b', [])],
      moved,
      'project-b',
    )

    expect(next[0]?.sessions.map((entry) => entry.id)).toEqual(['chat-2'])
    expect(next[1]?.sessions.map((entry) => entry.id)).toEqual(['chat-1'])
  })

  it('drops a chat from its project when it moves to the personal chats', () => {
    const moved = chat('chat-1', null)
    const projects = applyProjectSessionMove([project('project-a', [chat('chat-1', 'project-a')])], moved, null)
    const personal = applyPersonalSessionMove([chat('chat-9', null)], moved, null)

    expect(projects[0]?.sessions).toEqual([])
    expect(personal.map((entry) => entry.id)).toEqual(['chat-1', 'chat-9'])
  })

  it('removes a chat from the personal list when it moves into a project', () => {
    const moved = chat('chat-1', 'project-a')

    expect(applyPersonalSessionMove([chat('chat-1', null)], moved, 'project-a')).toEqual([])
  })

  it('stays idempotent when the own broadcast repeats an already applied move', () => {
    const moved = chat('chat-1', 'project-b')
    const once = applyProjectSessionMove(
      [project('project-a', [chat('chat-1', 'project-a')]), project('project-b', [])],
      moved,
      'project-b',
    )
    const twice = applyProjectSessionMove(once, moved, 'project-b')

    expect(twice[0]?.sessions).toEqual([])
    expect(twice[1]?.sessions.map((entry) => entry.id)).toEqual(['chat-1'])
  })

  it('leaves untouched projects referentially stable', () => {
    const untouched = project('project-c', [chat('chat-3', 'project-c')])
    const next = applyProjectSessionMove(
      [project('project-a', [chat('chat-1', 'project-a')]), untouched],
      chat('chat-1', null),
      null,
    )

    expect(next[1]).toBe(untouched)
  })
})
