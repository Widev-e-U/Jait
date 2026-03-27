import { describe, expect, it } from 'vitest'

import { canCommitAndPush, canSyncChanges, getPrimaryGitAction } from './workspace-git-actions'

describe('workspace git actions', () => {
  it('keeps commit as the primary action while there are local changes', () => {
    expect(getPrimaryGitAction(2, {
      hasUpstream: true,
      aheadCount: 3,
      behindCount: 1,
    } as never)).toBe('commit')
  })

  it('switches the primary action to sync when the branch is ahead or behind with no local changes', () => {
    expect(getPrimaryGitAction(0, {
      hasUpstream: true,
      aheadCount: 1,
      behindCount: 0,
    } as never)).toBe('sync')
    expect(getPrimaryGitAction(0, {
      hasUpstream: true,
      aheadCount: 0,
      behindCount: 2,
    } as never)).toBe('sync')
  })

  it('reports sync availability only for upstream branches with remote divergence', () => {
    expect(canSyncChanges({
      hasUpstream: true,
      aheadCount: 0,
      behindCount: 0,
    } as never)).toBe(false)
    expect(canSyncChanges({
      hasUpstream: false,
      aheadCount: 2,
      behindCount: 0,
    } as never)).toBe(false)
    expect(canSyncChanges({
      hasUpstream: true,
      aheadCount: 2,
      behindCount: 0,
    } as never)).toBe(true)
  })

  it('allows commit and push whenever there are local changes or unpublished commits', () => {
    expect(canCommitAndPush(1, null)).toBe(true)
    expect(canCommitAndPush(0, {
      hasUpstream: true,
      aheadCount: 2,
      behindCount: 0,
    } as never)).toBe(true)
    expect(canCommitAndPush(0, {
      hasUpstream: true,
      aheadCount: 0,
      behindCount: 2,
    } as never)).toBe(false)
  })
})
