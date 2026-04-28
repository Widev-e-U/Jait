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
  it('includes both workspace and repository identity', () => {
    expect(getDeveloperThreadRepoAutoSelectKey('workspace-1', 'repo-1')).toBe('workspace-1::repo-1')
    expect(getDeveloperThreadRepoAutoSelectKey('workspace-2', 'repo-1')).toBe('workspace-2::repo-1')
  })
})

describe('resolveDeveloperThreadRepoAutoSelect', () => {
  it('applies the workspace repo once for developer thread mode', () => {
    expect(resolveDeveloperThreadRepoAutoSelect({
      viewMode: 'developer',
      sendTarget: 'thread',
      workspaceId: 'workspace-1',
      workspaceRepoId: 'repo-2',
      repositories,
      lastAppliedKey: null,
    })).toEqual({
      nextAppliedKey: 'workspace-1::repo-2',
      repoId: 'repo-2',
    })
  })

  it('does not reapply when the same workspace/repo pair was already used', () => {
    expect(resolveDeveloperThreadRepoAutoSelect({
      viewMode: 'developer',
      sendTarget: 'thread',
      workspaceId: 'workspace-1',
      workspaceRepoId: 'repo-2',
      repositories,
      lastAppliedKey: 'workspace-1::repo-2',
    })).toBeNull()
  })

  it('waits for the workspace repo to exist in the loaded repository list', () => {
    expect(resolveDeveloperThreadRepoAutoSelect({
      viewMode: 'developer',
      sendTarget: 'thread',
      workspaceId: 'workspace-1',
      workspaceRepoId: 'repo-3',
      repositories,
      lastAppliedKey: null,
    })).toBeNull()
  })

  it('marks repo-less workspaces as applied without selecting a repository', () => {
    expect(resolveDeveloperThreadRepoAutoSelect({
      viewMode: 'developer',
      sendTarget: 'thread',
      workspaceId: 'workspace-1',
      workspaceRepoId: null,
      repositories,
      lastAppliedKey: null,
    })).toEqual({
      nextAppliedKey: 'workspace-1::',
      repoId: null,
    })
  })

  it('ignores other modes and targets', () => {
    expect(resolveDeveloperThreadRepoAutoSelect({
      viewMode: 'manager',
      sendTarget: 'thread',
      workspaceId: 'workspace-1',
      workspaceRepoId: 'repo-1',
      repositories,
      lastAppliedKey: null,
    })).toBeNull()

    expect(resolveDeveloperThreadRepoAutoSelect({
      viewMode: 'developer',
      sendTarget: 'agent',
      workspaceId: 'workspace-1',
      workspaceRepoId: 'repo-1',
      repositories,
      lastAppliedKey: null,
    })).toBeNull()
  })
})
