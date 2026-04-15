import { describe, expect, it } from 'vitest'
import type { GitStatusResult } from '@/lib/git-api'
import { shouldRenderThreadActions, shouldShowThreadChangesButton } from './thread-actions-state'

function gitStatus(overrides: Partial<GitStatusResult> = {}): GitStatusResult {
  return {
    branch: 'jait/feature',
    hasWorkingTreeChanges: false,
    index: { files: [], insertions: 0, deletions: 0 },
    workingTree: { files: [], insertions: 0, deletions: 0 },
    hasUpstream: false,
    aheadCount: 0,
    behindCount: 0,
    pr: null,
    ghAvailable: false,
    prProvider: 'github',
    remoteUrl: 'https://github.com/example/repo.git',
    ...overrides,
  }
}

describe('shouldShowThreadChangesButton', () => {
  it('keeps terminal PR changes visible while the thread branch is recorded', () => {
    expect(shouldShowThreadChangesButton(gitStatus({ branch: 'main' }), 'jait/feature', 'merged')).toBe(true)
    expect(shouldShowThreadChangesButton(gitStatus({ branch: 'main' }), 'jait/feature', 'closed')).toBe(true)
  })

  it('hides terminal PR changes when the thread branch is gone', () => {
    expect(shouldShowThreadChangesButton(gitStatus({ branch: 'main' }), null, 'merged')).toBe(false)
  })

  it('keeps terminal PR changes visible while currently on the thread branch', () => {
    expect(shouldShowThreadChangesButton(gitStatus(), 'jait/feature', 'merged')).toBe(true)
  })

  it('keeps non-terminal PR changes visible for the existing branch diff flow', () => {
    expect(shouldShowThreadChangesButton(gitStatus({ branch: 'main' }), 'jait/feature', 'open')).toBe(true)
    expect(shouldShowThreadChangesButton(gitStatus({ branch: 'main' }), 'jait/feature', null)).toBe(true)
  })

  it('keeps local working tree changes visible even for terminal PRs', () => {
    expect(shouldShowThreadChangesButton(gitStatus({ hasWorkingTreeChanges: true }), 'jait/feature', 'closed')).toBe(true)
  })
})

describe('shouldRenderThreadActions', () => {
  it('renders actions for delivery threads with an active branch before completion', () => {
    expect(shouldRenderThreadActions({
      hasRepository: true,
      threadKind: 'delivery',
      threadStatus: 'running',
      threadBranch: 'jait/feature',
      prUrl: null,
      prState: null,
    })).toBe(true)
  })

  it('keeps actions hidden when there is no repo context', () => {
    expect(shouldRenderThreadActions({
      hasRepository: false,
      threadKind: 'delivery',
      threadStatus: 'running',
      threadBranch: 'jait/feature',
      prUrl: null,
      prState: null,
    })).toBe(false)
  })

  it('does not render PR/change actions for helper threads', () => {
    expect(shouldRenderThreadActions({
      hasRepository: true,
      threadKind: 'delegation',
      threadStatus: 'running',
      threadBranch: 'jait/helper',
      prUrl: null,
      prState: null,
    })).toBe(false)
  })

  it('still renders completed and PR-linked delivery threads without a branch', () => {
    expect(shouldRenderThreadActions({
      hasRepository: true,
      threadKind: 'delivery',
      threadStatus: 'completed',
      threadBranch: null,
      prUrl: null,
      prState: null,
    })).toBe(true)
    expect(shouldRenderThreadActions({
      hasRepository: true,
      threadKind: 'delivery',
      threadStatus: 'idle',
      threadBranch: null,
      prUrl: 'https://github.com/example/repo/pull/1',
      prState: 'open',
    })).toBe(true)
  })
})
