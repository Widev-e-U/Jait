import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { getSessionContextMenuPosition, SessionSelector } from './session-selector'
import type { ProjectRecord } from '@/hooks/useProjects'

function createProject(): ProjectRecord {
  return {
    id: 'project-1',
    title: 'Jait',
    rootPath: '/workspace/jait',
    nodeId: 'gateway',
    status: 'active',
    createdAt: '2026-07-01T00:00:00.000Z',
    lastActiveAt: '2026-07-06T00:00:00.000Z',
    metadata: null,
    sessions: Array.from({ length: 6 }, (_, index) => ({
      id: `session-${index + 1}`,
      projectId: 'project-1',
      name: `Chat ${index + 1}`,
      projectPath: '/workspace/jait',
      status: 'active' as const,
      createdAt: `2026-07-0${6 - index}T00:00:00.000Z`,
      lastActiveAt: `2026-07-0${6 - index}T00:00:00.000Z`,
      viewedAt: null,
      metadata: null,
    })),
  }
}

describe('SessionSelector', () => {
  it('shows five recent project chats and offers to reveal older ones', () => {
    const markup = renderToStaticMarkup(
      <SessionSelector
        projects={[createProject()]}
        activeProjectId={null}
        onSelectProject={() => {}}
        onCreateProject={() => {}}
        onRemoveProject={() => {}}
        onChangeDirectory={() => {}}
      />,
    )

    expect(markup).toContain('Chat 1')
    expect(markup).toContain('Chat 5')
    expect(markup).not.toContain('Chat 6')
    expect(markup).toContain('Show older')
  })

  it('renders personal chats with the compact project-chat sizing', () => {
    const markup = renderToStaticMarkup(
      <SessionSelector
        projects={[]}
        personalSessions={[{
          id: 'personal-1',
          projectId: null,
          name: 'Personal chat',
          projectPath: null,
          status: 'active',
          createdAt: '2026-07-01T00:00:00.000Z',
          lastActiveAt: '2026-07-06T00:00:00.000Z',
          viewedAt: null,
          metadata: null,
        }]}
        activeProjectId={null}
        onSelectProject={() => {}}
        onCreateProject={() => {}}
        onRemoveProject={() => {}}
        onChangeDirectory={() => {}}
      />,
    )

    expect(markup).toContain('h-3.5 w-3.5')
    expect(markup).toContain('truncate text-xs font-medium')
    expect(markup).not.toContain('h-4 w-4 shrink-0')
    expect(markup).not.toContain('truncate text-sm font-medium')
  })

  it('renders an unread dot for sessions with new activity since last viewed', () => {
    const project = createProject()
    // Session 1: never viewed → unread. Session 2: viewed after last activity → read.
    project.sessions[1].viewedAt = '2026-07-06T00:00:00.500Z' // after its lastActiveAt
    const markup = renderToStaticMarkup(
      <SessionSelector
        projects={[project]}
        activeProjectId={null}
        onSelectProject={() => {}}
        onCreateProject={() => {}}
        onRemoveProject={() => {}}
        onChangeDirectory={() => {}}
      />,
    )
    expect(markup).toContain('rounded-full bg-blue-500')
  })

  it('does not render an unread dot for the active session', () => {
    const project = createProject()
    // Mark every session as already read so the only unread candidate is the
    // active one (session-1, never viewed) whose dot must be suppressed.
    project.sessions.forEach((session) => { session.viewedAt = '2026-07-07T00:00:00.000Z' })
    const markup = renderToStaticMarkup(
      <SessionSelector
        projects={[project]}
        activeProjectId="project-1"
        activeSessionId="session-1"
        onSelectProject={() => {}}
        onCreateProject={() => {}}
        onRemoveProject={() => {}}
        onChangeDirectory={() => {}}
      />,
    )
    // Session 1 is active (never viewed) but its dot is suppressed.
    const unreadCount = (markup.match(/rounded-full bg-blue-500/g) ?? []).length
    expect(unreadCount).toBe(0)
  })

  it('keeps the chat context menu inside the viewport', () => {
    expect(getSessionContextMenuPosition(100, 100, 400, 400)).toEqual({ left: 100, top: 100 })
    expect(getSessionContextMenuPosition(390, 390, 400, 400)).toEqual({ left: 216, top: 352 })
    expect(getSessionContextMenuPosition(-10, -10, 400, 400)).toEqual({ left: 8, top: 8 })
  })
})
