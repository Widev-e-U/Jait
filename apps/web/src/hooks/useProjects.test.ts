import { describe, expect, it } from 'vitest'

import { getMissingSelectedProjectId, type ProjectRecord } from '@/hooks/useProjects'
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
