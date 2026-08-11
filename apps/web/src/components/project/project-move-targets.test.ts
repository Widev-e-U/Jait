import { describe, expect, it } from 'vitest'
import { canMoveToTopLevel, getProjectMoveTargets } from './project-move-targets'
import type { ProjectRecord } from '@/hooks/useProjects'

function make(id: string, overrides: Partial<ProjectRecord> = {}): ProjectRecord {
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

const workspace = (id: string, overrides: Partial<ProjectRecord> = {}) =>
  make(id, { kind: 'workspace', rootPath: `/home/me/${id}`, ...overrides })

describe('getProjectMoveTargets', () => {
  it('offers folders as targets for a workspace project', () => {
    // The whole point: a project with a path on disk can be filed under
    // "Work" or "Private".
    const projects = [make('work'), make('private'), workspace('jait')]
    const targets = getProjectMoveTargets(projects, 'jait')
    expect(targets.map((t) => t.project.id)).toEqual(['work', 'private'])
    expect(targets.every((t) => !t.disabled)).toBe(true)
  })

  it('offers a project that owns a directory as a target too', () => {
    // Folders and projects are one entity — a folder can be given a directory
    // at any time — so excluding rows that have one would make the menu shrink
    // the moment a folder got a repository. The child inherits the directory.
    const projects = [make('work'), workspace('jait'), workspace('other')]
    expect(getProjectMoveTargets(projects, 'other').map((t) => t.project.id)).toEqual(['work', 'jait'])
  })

  it('never offers the moved row as its own destination', () => {
    const projects = [make('work'), make('sub', { parentId: 'work' })]
    expect(getProjectMoveTargets(projects, 'work').map((t) => t.project.id)).toEqual(['sub'])
  })

  it('marks the folder the project already sits in', () => {
    const projects = [make('work'), workspace('jait', { parentId: 'work' })]
    const [work] = getProjectMoveTargets(projects, 'jait')
    expect(work?.isCurrent).toBe(true)
    expect(work?.disabled).toBe(true)
    // No reason text — "current" is not a failure worth explaining.
    expect(work?.reason).toBeNull()
  })

  it('disables a folder inside the moved folder rather than hiding it', () => {
    const projects = [make('work'), make('sub', { parentId: 'work' })]
    const targets = getProjectMoveTargets(projects, 'work')
    const sub = targets.find((t) => t.project.id === 'sub')
    expect(sub?.disabled).toBe(true)
    expect(sub?.reason).toBe('A folder cannot be moved into itself.')
  })

  it('reports nesting that would exceed the depth limit', () => {
    // MAX_FOLDER_DEPTH is 5, so a fifth level is one too many.
    const projects = [
      make('a'),
      make('b', { parentId: 'a' }),
      make('c', { parentId: 'b' }),
      make('d', { parentId: 'c' }),
      make('e', { parentId: 'd' }),
      workspace('ws'),
    ]
    const deepest = getProjectMoveTargets(projects, 'ws').find((t) => t.project.id === 'e')
    expect(deepest?.disabled).toBe(true)
    expect(deepest?.reason).toBe('That would nest folders too deeply.')
  })

  it('returns folders in tree order with depth for indentation', () => {
    const projects = [
      make('work'),
      make('client', { parentId: 'work' }),
      make('private'),
      workspace('ws'),
    ]
    expect(getProjectMoveTargets(projects, 'ws').map((t) => [t.project.id, t.depth])).toEqual([
      ['work', 0],
      ['client', 1],
      ['private', 0],
    ])
  })

  it('has no targets when no folder exists yet', () => {
    expect(getProjectMoveTargets([workspace('ws')], 'ws')).toEqual([])
  })
})

describe('canMoveToTopLevel', () => {
  it('is false for a project already at the top', () => {
    expect(canMoveToTopLevel([workspace('ws')], 'ws')).toBe(false)
  })

  it('is true for a project inside a folder', () => {
    const projects = [make('work'), workspace('ws', { parentId: 'work' })]
    expect(canMoveToTopLevel(projects, 'ws')).toBe(true)
  })
})
