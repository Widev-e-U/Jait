import { describe, expect, it } from 'vitest'

import {
  getDeveloperThreadRepoAutoSelectKey,
  resolveDeveloperThreadRepoAutoSelect,
} from './developer-thread-repo-selection'

const repositories = [
  { id: 'repo-1' },
  { id: 'repo-2' },
]

describe('getDeveloperThreadRepoAutoSelectKey', () => {
  it('includes both project and repository identity', () => {
    expect(getDeveloperThreadRepoAutoSelectKey('project-1', 'repo-1')).toBe('project-1::repo-1')
    expect(getDeveloperThreadRepoAutoSelectKey('project-2', 'repo-1')).toBe('project-2::repo-1')
  })
})

describe('resolveDeveloperThreadRepoAutoSelect', () => {
  it('applies the project repo once for developer thread mode', () => {
    expect(resolveDeveloperThreadRepoAutoSelect({
      viewMode: 'developer',
      sendTarget: 'thread',
      projectId: 'project-1',
      projectRepoId: 'repo-2',
      repositories,
      lastAppliedKey: null,
    })).toEqual({
      nextAppliedKey: 'project-1::repo-2',
      repoId: 'repo-2',
    })
  })

  it('does not reapply when the same project/repo pair was already used', () => {
    expect(resolveDeveloperThreadRepoAutoSelect({
      viewMode: 'developer',
      sendTarget: 'thread',
      projectId: 'project-1',
      projectRepoId: 'repo-2',
      repositories,
      lastAppliedKey: 'project-1::repo-2',
    })).toBeNull()
  })

  it('waits for the project repo to exist in the loaded repository list', () => {
    expect(resolveDeveloperThreadRepoAutoSelect({
      viewMode: 'developer',
      sendTarget: 'thread',
      projectId: 'project-1',
      projectRepoId: 'repo-3',
      repositories,
      lastAppliedKey: null,
    })).toBeNull()
  })

  it('marks repo-less projects as applied without selecting a repository', () => {
    expect(resolveDeveloperThreadRepoAutoSelect({
      viewMode: 'developer',
      sendTarget: 'thread',
      projectId: 'project-1',
      projectRepoId: null,
      repositories,
      lastAppliedKey: null,
    })).toEqual({
      nextAppliedKey: 'project-1::',
      repoId: null,
    })
  })

  it('ignores other modes and targets', () => {
    expect(resolveDeveloperThreadRepoAutoSelect({
      viewMode: 'manager',
      sendTarget: 'thread',
      projectId: 'project-1',
      projectRepoId: 'repo-1',
      repositories,
      lastAppliedKey: null,
    })).toBeNull()

    expect(resolveDeveloperThreadRepoAutoSelect({
      viewMode: 'developer',
      sendTarget: 'agent',
      projectId: 'project-1',
      projectRepoId: 'repo-1',
      repositories,
      lastAppliedKey: null,
    })).toBeNull()
  })
})
