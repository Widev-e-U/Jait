import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { getSessionContextMenuPosition, SessionSelector } from './session-selector'
import type { ProjectRecord } from '@/hooks/useProjects'

function createProject(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 'project-1',
    title: 'Jait',
    rootPath: '/workspace/jait',
    nodeId: 'gateway',
    status: 'active',
    createdAt: '2026-07-01T00:00:00.000Z',
    lastActiveAt: '2026-07-06T00:00:00.000Z',
    metadata: null,
    parentId: null,
    kind: 'workspace',
    instructions: null,
    description: null,
    color: null,
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
    ...overrides,
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

  it('renders projects and root chats in one combined list', () => {
    const markup = renderToStaticMarkup(
      <SessionSelector
        projects={[createProject({ sessions: [] })]}
        personalSessions={[{
          id: 'personal-1',
          projectId: null,
          name: 'Root chat',
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

    expect(markup).toContain('Projects &amp; Chats')
    expect(markup).toContain('Jait')
    expect(markup).toContain('Root chat')
    expect(markup).not.toContain('Personal chats')
  })

  it('shows five recent personal chats and offers to reveal older ones', () => {
    const personalSessions = Array.from({ length: 6 }, (_, index) => ({
      id: `personal-${index + 1}`,
      projectId: null,
      name: `Personal ${index + 1}`,
      projectPath: null,
      status: 'active' as const,
      createdAt: `2026-07-0${6 - index}T00:00:00.000Z`,
      lastActiveAt: `2026-07-0${6 - index}T00:00:00.000Z`,
      viewedAt: null,
      metadata: null,
    }))
    const markup = renderToStaticMarkup(
      <SessionSelector
        projects={[]}
        personalSessions={personalSessions}
        activeProjectId={null}
        onSelectProject={() => {}}
        onCreateProject={() => {}}
        onRemoveProject={() => {}}
        onChangeDirectory={() => {}}
      />,
    )

    expect(markup).toContain('Personal 1')
    expect(markup).toContain('Personal 5')
    expect(markup).not.toContain('Personal 6')
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

  it('keeps project actions visible on mobile alongside the editor state', () => {
    const markup = renderToStaticMarkup(
      <SessionSelector
        projects={[createProject({ editorModeActive: true })]}
        activeProjectId="project-1"
        showEditorModeStatus
        isMobile
        onSelectProject={() => {}}
        onCreateProject={() => {}}
        onRemoveProject={() => {}}
        onChangeDirectory={() => {}}
      />,
    )

    expect(markup).toContain('aria-label="Editor mode active for Jait"')
    expect(markup).not.toContain('aria-pressed')
    expect(markup).toContain('aria-label="Project actions"')
    expect(markup).not.toContain('sm:opacity-0')
  })

  it('shows persisted editor mode independently for every project row', () => {
    const markup = renderToStaticMarkup(
      <SessionSelector
        projects={[
          createProject({ id: 'project-1', title: 'Inactive', editorModeActive: false }),
          createProject({ id: 'project-2', title: 'Active elsewhere', editorModeActive: true }),
        ]}
        activeProjectId="project-1"
        showEditorModeStatus
        onSelectProject={() => {}}
        onCreateProject={() => {}}
        onRemoveProject={() => {}}
        onChangeDirectory={() => {}}
      />,
    )

    expect(markup).toContain('aria-label="Editor mode inactive for Inactive"')
    expect(markup).toContain('aria-label="Editor mode active for Active elsewhere"')
  })

  it('omits editor status when the mobile selector does not request it', () => {
    const markup = renderToStaticMarkup(
      <SessionSelector
        projects={[createProject()]}
        activeProjectId="project-1"
        isMobile
        onSelectProject={() => {}}
        onCreateProject={() => {}}
        onRemoveProject={() => {}}
        onChangeDirectory={() => {}}
      />,
    )

    expect(markup).not.toContain('Editor mode active for Jait')
    expect(markup).toContain('aria-label="Project actions"')
  })

  it('keeps the chat context menu inside the viewport', () => {
    expect(getSessionContextMenuPosition(100, 100, 400, 400)).toEqual({ left: 100, top: 100 })
    expect(getSessionContextMenuPosition(390, 390, 400, 400)).toEqual({ left: 136, top: 352 })
    expect(getSessionContextMenuPosition(-10, -10, 400, 400)).toEqual({ left: 8, top: 8 })
  })

  it('lifts a tall move menu further up so its last item stays reachable', () => {
    // A menu listing projects is much taller than the old archive-only one;
    // clamping against the small default would push it off-screen.
    expect(getSessionContextMenuPosition(100, 300, 400, 400, 240)).toEqual({ left: 100, top: 152 })
  })

  describe('folder tree', () => {
    function folder(id: string, title: string, overrides: Partial<ProjectRecord> = {}): ProjectRecord {
      return {
        id,
        title,
        rootPath: null,
        nodeId: 'gateway',
        status: 'active',
        createdAt: '2026-07-01T00:00:00.000Z',
        lastActiveAt: '2026-07-06T00:00:00.000Z',
        metadata: null,
        parentId: null,
        kind: 'folder',
        instructions: null,
        description: null,
        color: null,
        sessions: [],
        ...overrides,
      }
    }

    const renderTree = (projects: ProjectRecord[]) => renderToStaticMarkup(
      <SessionSelector
        projects={projects}
        activeProjectId={null}
        onSelectProject={() => {}}
        onCreateProject={() => {}}
        onCreateFolder={() => {}}
        onEditProject={() => {}}
        onMoveProject={() => {}}
        onRemoveProject={() => {}}
        onChangeDirectory={() => {}}
      />,
    )

    it('indents a nested folder below its parent', () => {
      const markup = renderTree([
        folder('root', 'Work'),
        folder('child', 'Client A', { parentId: 'root' }),
      ])
      expect(markup).toContain('Work')
      expect(markup).toContain('Client A')
      // Depth 1 → one indent step; the root row stays flush.
      expect(markup).toContain('margin-left:12px')
    })

    it('renders a colour dot for a folder that has one', () => {
      const markup = renderTree([folder('root', 'Work', { color: 'blue' })])
      expect(markup).toContain('#3b82f6')
    })

    it('omits the colour dot when no colour is set', () => {
      const markup = renderTree([folder('root', 'Work')])
      expect(markup).not.toContain('#3b82f6')
    })

    it('marks a folder that carries context so its effect is visible in the tree', () => {
      const markup = renderTree([folder('root', 'Work', { instructions: 'Answer in German.' })])
      expect(markup).toContain('ctx')
    })

    it('shows the description instead of a missing path for folders', () => {
      const markup = renderTree([folder('root', 'Work', { description: 'Job stuff' })])
      expect(markup).toContain('Job stuff')
      // "No folder linked" would read as a defect on something that never has a path.
      expect(markup).not.toContain('No folder linked')
    })

    it('still shows the path for a workspace project', () => {
      const markup = renderTree([createProject()])
      expect(markup).toContain('/workspace/jait')
    })

    it('nests a workspace project under a folder, keeping its path', () => {
      // The "Work / Private" case: a real project with a directory on disk
      // filed under a category folder.
      const markup = renderTree([
        folder('private', 'Private'),
        { ...createProject(), parentId: 'private' },
      ])
      expect(markup).toContain('Private')
      expect(markup).toContain('/workspace/jait')
      expect(markup).toContain('margin-left:12px')
    })

    it('keeps a nested project\'s chats reachable', () => {
      // Filing a project into a folder must not cost it its chat list.
      const markup = renderTree([
        folder('private', 'Private'),
        { ...createProject(), parentId: 'private' },
      ])
      expect(markup).toContain('Chat 1')
      expect(markup).toContain('Show older')
    })

    it('gives a folder holding a project a collapse control', () => {
      const markup = renderTree([
        folder('private', 'Private'),
        { ...createProject(), parentId: 'private' },
      ])
      // Without this the branch could never be folded away.
      expect(markup).toContain('Collapse folder')
    })

    it('surfaces an orphaned child at the root rather than hiding it', () => {
      // Parent archived out of the active list — the child must stay reachable.
      const markup = renderTree([folder('child', 'Client A', { parentId: 'archived-parent' })])
      expect(markup).toContain('Client A')
    })
  })
})
