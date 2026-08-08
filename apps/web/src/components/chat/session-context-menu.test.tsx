import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { getSessionContextMenuHeight, SessionContextMenu } from './session-context-menu'
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

function renderMenu(props: Partial<Parameters<typeof SessionContextMenu>[0]> = {}) {
  return renderToStaticMarkup(
    <SessionContextMenu
      sessionId="chat-1"
      sessionProjectId={null}
      left={10}
      top={10}
      projects={[createProject('project-1', 'Jait'), createProject('project-2', 'Mobile App')]}
      onMoveSession={() => {}}
      onArchiveSession={() => {}}
      onClose={() => {}}
      {...props}
    />,
  )
}

describe('SessionContextMenu', () => {
  it('offers every project as a move target alongside archiving', () => {
    const markup = renderMenu()

    expect(markup).toContain('Move to project')
    expect(markup).toContain('Jait')
    expect(markup).toContain('Mobile App')
    expect(markup).toContain('Archive chat')
  })

  it('does not offer the personal chats to a chat that is already personal', () => {
    expect(renderMenu()).not.toContain('Move to personal chats')
  })

  it('offers the personal chats to a project chat and marks its current project', () => {
    const markup = renderMenu({ sessionProjectId: 'project-1' })

    expect(markup).toContain('Move to personal chats')
    expect(markup).toContain('current')
    // The chat's own project must not be a clickable target.
    expect(markup).toContain('disabled=""')
  })

  it('blocks moving while the chat is still responding', () => {
    const markup = renderMenu({ sessionProjectId: 'project-1', isStreaming: true })

    expect(markup).toContain('Not while this chat is responding.')
    // Archiving stays available — only the move targets are disabled.
    expect(markup).toContain('Archive chat')
    const disabledCount = (markup.match(/disabled=""/g) ?? []).length
    expect(disabledCount).toBe(3) // two projects + personal chats
  })

  it('renders without the move section when no move handler is wired', () => {
    const markup = renderMenu({ onMoveSession: undefined })

    expect(markup).not.toContain('Move to project')
    expect(markup).toContain('Archive chat')
  })

  it('flags move targets whose node is offline', () => {
    const markup = renderMenu({ offlineProjectIds: new Set(['project-2']) })

    expect(markup).toContain('Node offline')
  })

  it('shows a project search once a lookup is available', () => {
    expect(renderMenu()).not.toContain('Search projects')
    expect(renderMenu({ onSearchProjects: async () => [] })).toContain('Search projects')
  })
})

describe('getSessionContextMenuHeight', () => {
  const base = {
    showMoveSection: true,
    projectCount: 2,
    showSearch: false,
    showStreamingNote: false,
    showPersonalTarget: false,
    showArchive: true,
  }

  it('grows with each rendered section', () => {
    const plain = getSessionContextMenuHeight(base)

    expect(getSessionContextMenuHeight({ ...base, showSearch: true })).toBeGreaterThan(plain)
    expect(getSessionContextMenuHeight({ ...base, showPersonalTarget: true })).toBeGreaterThan(plain)
    expect(getSessionContextMenuHeight({ ...base, projectCount: 5 })).toBeGreaterThan(plain)
  })

  it('stops growing once the project list starts scrolling', () => {
    expect(getSessionContextMenuHeight({ ...base, projectCount: 50 }))
      .toBe(getSessionContextMenuHeight({ ...base, projectCount: 6 }))
  })

  it('falls back to the archive-only height without a move section', () => {
    expect(getSessionContextMenuHeight({ ...base, showMoveSection: false })).toBe(38)
  })
})
