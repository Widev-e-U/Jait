import { describe, expect, it } from 'vitest'
import { getProjectRepository, getProjectRepositoryId } from './project-repositories'
import type { AutomationRepository } from './automation-repositories'

const repos: AutomationRepository[] = [
  {
    id: 'repo-1',
    name: 'Jait',
    defaultBranch: 'main',
    localPath: '/project/jait',
    source: 'local',
  },
]

describe('project repository metadata helpers', () => {
  it('reads current and legacy repository metadata keys', () => {
    expect(getProjectRepositoryId({ metadata: JSON.stringify({ repositoryId: 'repo-1' }) })).toBe('repo-1')
    expect(getProjectRepositoryId({ metadata: JSON.stringify({ repoId: 'repo-legacy' }) })).toBe('repo-legacy')
  })

  it('returns the assigned repository when it is available', () => {
    expect(getProjectRepository({ metadata: JSON.stringify({ repositoryId: 'repo-1' }) }, repos)).toEqual(repos[0])
  })

  it('ignores invalid metadata', () => {
    expect(getProjectRepositoryId({ metadata: '{bad-json' })).toBeNull()
    expect(getProjectRepository({ metadata: JSON.stringify({ repositoryId: 'missing' }) }, repos)).toBeNull()
  })
})
