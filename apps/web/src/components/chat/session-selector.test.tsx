import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { SessionSelector } from './session-selector'
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
})
