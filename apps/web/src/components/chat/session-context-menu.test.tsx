import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  getSessionContextMenuHeight,
  getSessionMoveSubmenuPosition,
  SessionContextMenu,
  SessionMoveSubmenu,
} from './session-context-menu'
import type { ProjectRecord } from '@/hooks/useProjects'

function createProject(id: string, title: string): ProjectRecord {
  return {
    id,
    title,
    rootPath: `/workspace/${id}`,
    nodeId: 'gateway',
    status: 'active',
    createdAt: '2026-08-01T00:00:00.000Z',
    lastActiveAt: '2026-08-01T00:00:00.000Z',
    metadata: null,
    sessions: [],
  }
}

const projects = [createProject('project-1', 'Jait'), createProject('project-2', 'Mobile App')]

function renderMenu(props: Partial<Parameters<typeof SessionContextMenu>[0]> = {}) {
  return renderToStaticMarkup(
    <SessionContextMenu
      sessionId="chat-1"
      sessionProjectId={null}
      left={10}
      top={10}
      projects={projects}
      onMoveSession={() => {}}
      onArchiveSession={() => {}}
      onClose={() => {}}
      {...props}
    />,
  )
}

function renderSubmenu(props: Partial<Parameters<typeof SessionMoveSubmenu>[0]> = {}) {
  return renderToStaticMarkup(
    <SessionMoveSubmenu
      left={10}
      top={10}
      sessionProjectId={null}
      projects={projects}
      onSelectProject={() => {}}
      {...props}
    />,
  )
}

describe('SessionContextMenu', () => {
  it('keeps the project list behind a submenu parent instead of listing it inline', () => {
    const markup = renderMenu()

    expect(markup).toContain('Move to project')
    expect(markup).toContain('aria-haspopup="menu"')
    expect(markup).toContain('aria-expanded="false"')
    // The projects themselves only show up once the submenu opens.
    expect(markup).not.toContain('Mobile App')
    expect(markup).toContain('Archive chat')
    expect(markup).toContain('text-red-600')
    expect(markup).not.toContain('text-destructive')
  })

  it('does not offer the personal chats to a chat that is already personal', () => {
    expect(renderMenu()).not.toContain('Move to personal chats')
  })

  it('offers the personal chats to a project chat', () => {
    expect(renderMenu({ sessionProjectId: 'project-1' })).toContain('Move to personal chats')
  })

  it('blocks moving while the chat is still responding', () => {
    const markup = renderMenu({ sessionProjectId: 'project-1', isStreaming: true })

    expect(markup).toContain('Not while this chat is responding.')
    expect(markup).toContain('Archive chat')
    // The submenu parent and the personal-chats row, but never archiving.
    expect((markup.match(/disabled=""/g) ?? []).length).toBe(2)
  })

  it('renders without the move section when no move handler is wired', () => {
    const markup = renderMenu({ onMoveSession: undefined })

    expect(markup).not.toContain('Move to project')
    expect(markup).toContain('Archive chat')
  })
})

describe('SessionMoveSubmenu', () => {
  it('lists every project as a target', () => {
    const markup = renderSubmenu()

    expect(markup).toContain('Jait')
    expect(markup).toContain('Mobile App')
  })

  it('marks the chat\'s own project as the current one and blocks it', () => {
    const markup = renderSubmenu({ sessionProjectId: 'project-1' })

    expect(markup).toContain('current')
    expect(markup).toContain('disabled=""')
  })

  it('flags targets whose node is offline', () => {
    expect(renderSubmenu({ offlineProjectIds: new Set(['project-2']) })).toContain('Node offline')
  })

  it('shows a project search once a lookup is available', () => {
    expect(renderSubmenu()).not.toContain('Search projects')
    expect(renderSubmenu({ onSearchProjects: async () => [] })).toContain('Search projects')
  })

  it('says so when there is nothing to move into', () => {
    expect(renderSubmenu({ projects: [] })).toContain('No projects yet.')
  })
})

describe('getSessionMoveSubmenuPosition', () => {
  const viewport = { width: 1000, height: 800 }
  const submenu = { width: 256, height: 240 }

  it('opens to the right of its parent row', () => {
    expect(getSessionMoveSubmenuPosition({ left: 100, right: 356, top: 200 }, viewport, submenu))
      .toEqual({ left: 356, top: 200 })
  })

  it('flips to the left when the right edge has no room', () => {
    expect(getSessionMoveSubmenuPosition({ left: 700, right: 956, top: 200 }, viewport, submenu))
      .toEqual({ left: 444, top: 200 })
  })

  it('lifts the submenu so its bottom stays on screen', () => {
    expect(getSessionMoveSubmenuPosition({ left: 100, right: 356, top: 760 }, viewport, submenu).top)
      .toBe(552)
  })
})

describe('getSessionContextMenuHeight', () => {
  const base = {
    showMoveSection: true,
    showStreamingNote: false,
    showPersonalTarget: false,
    showArchive: true,
  }

  it('grows with each rendered row', () => {
    const plain = getSessionContextMenuHeight(base)

    expect(getSessionContextMenuHeight({ ...base, showPersonalTarget: true })).toBeGreaterThan(plain)
    expect(getSessionContextMenuHeight({ ...base, showStreamingNote: true })).toBeGreaterThan(plain)
  })

  it('stays compact now that the projects live in a submenu', () => {
    // Parent row + divider + archive row + padding.
    expect(getSessionContextMenuHeight(base)).toBe(77)
  })

  it('falls back to the archive-only height without a move section', () => {
    expect(getSessionContextMenuHeight({ ...base, showMoveSection: false })).toBe(38)
  })
})
