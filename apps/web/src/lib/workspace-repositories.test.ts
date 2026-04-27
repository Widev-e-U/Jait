import { describe, expect, it } from 'vitest'
import { getWorkspaceRepository, getWorkspaceRepositoryId } from './workspace-repositories'
import type { AutomationRepository } from './automation-repositories'

const repos: AutomationRepository[] = [
  {
    id: 'repo-1',
    name: 'Jait',
    defaultBranch: 'main',
    localPath: '/workspace/jait',
    source: 'local',
  },
]

describe('workspace repository metadata helpers', () => {
  it('reads current and legacy repository metadata keys', () => {
    expect(getWorkspaceRepositoryId({ metadata: JSON.stringify({ repositoryId: 'repo-1' }) })).toBe('repo-1')
    expect(getWorkspaceRepositoryId({ metadata: JSON.stringify({ repoId: 'repo-legacy' }) })).toBe('repo-legacy')
  })

  it('returns the assigned repository when it is available', () => {
    expect(getWorkspaceRepository({ metadata: JSON.stringify({ repositoryId: 'repo-1' }) }, repos)).toEqual(repos[0])
  })

  it('ignores invalid metadata', () => {
    expect(getWorkspaceRepositoryId({ metadata: '{bad-json' })).toBeNull()
    expect(getWorkspaceRepository({ metadata: JSON.stringify({ repositoryId: 'missing' }) }, repos)).toBeNull()
  })
})
