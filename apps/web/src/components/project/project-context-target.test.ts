import { describe, expect, it } from 'vitest'
import { resolveProjectContextView, type ProjectContextTarget } from './project-context-target'
import type { ProjectRecord } from '@/hooks/useProjects'

function makeFolder(id: string, overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id,
    title: id,
    rootPath: null,
    nodeId: 'gateway',
    parentId: null,
    kind: 'folder',
    instructions: null,
    description: null,
    color: null,
    status: 'active',
    createdAt: '2026-08-01T00:00:00.000Z',
    lastActiveAt: '2026-08-01T00:00:00.000Z',
    metadata: null,
    sessions: [],
    ...overrides,
  }
}

const projects: ProjectRecord[] = [
  makeFolder('root', { title: 'Arbeit', instructions: 'Antworte auf Deutsch.' }),
  makeFolder('mid', { title: 'Kunde A', parentId: 'root', instructions: 'Fasse dich kurz.' }),
  makeFolder('leaf', { title: 'Angebot', parentId: 'mid' }),
]

describe('resolveProjectContextView', () => {
  it('resolves nothing when the dialog is closed', () => {
    expect(resolveProjectContextView(projects, null)).toEqual({ project: null, ancestors: [] })
  })

  describe('create mode', () => {
    const create = (parentId: string | null): ProjectContextTarget => ({ mode: 'create', parentId })

    it('has no project row — the folder does not exist until Save', () => {
      expect(resolveProjectContextView(projects, create('mid')).project).toBeNull()
      expect(resolveProjectContextView(projects, create(null)).project).toBeNull()
    })

    it('includes the parent itself in the inherited chain', () => {
      // A folder created under "Kunde A" inherits both levels. Reusing the
      // edit-mode chain here would silently drop "Fasse dich kurz."
      const { ancestors } = resolveProjectContextView(projects, create('mid'))
      expect(ancestors.map((a) => a.id)).toEqual(['root', 'mid'])
    })

    it('inherits nothing at the root', () => {
      expect(resolveProjectContextView(projects, create(null)).ancestors).toEqual([])
    })

    it('inherits nothing when the parent is not loaded', () => {
      expect(resolveProjectContextView(projects, create('gone')).ancestors).toEqual([])
    })
  })

  describe('edit mode', () => {
    it('resolves the row being edited', () => {
      const { project } = resolveProjectContextView(projects, { mode: 'edit', projectId: 'leaf' })
      expect(project?.title).toBe('Angebot')
    })

    it('excludes the row itself from the inherited chain', () => {
      const { ancestors } = resolveProjectContextView(projects, { mode: 'edit', projectId: 'leaf' })
      expect(ancestors.map((a) => a.id)).toEqual(['root', 'mid'])
    })

    it('survives a project id that is no longer loaded', () => {
      const view = resolveProjectContextView(projects, { mode: 'edit', projectId: 'gone' })
      expect(view).toEqual({ project: null, ancestors: [] })
    })
  })
})
