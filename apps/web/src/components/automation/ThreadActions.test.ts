import { describe, expect, it } from 'vitest'
import type { GitStatusResult } from '@/lib/git-api'
import {
  getThreadDiffRequest,
  shouldRenderThreadActions,
  shouldShowThreadChangesButton,
  shouldUseRecordedBranchDiff,
} from './thread-actions-state'

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

describe('shouldUseRecordedBranchDiff', () => {
  it('keeps local diff mode before PR creation', () => {
    expect(shouldUseRecordedBranchDiff('jait/feature', null)).toBe(false)
  })

  it('uses the recorded branch diff while the PR is being created', () => {
    expect(shouldUseRecordedBranchDiff('jait/feature', 'creating')).toBe(true)
  })

  it('uses the recorded branch diff while the PR is open', () => {
    expect(shouldUseRecordedBranchDiff('jait/feature', 'open')).toBe(true)
  })

  it('uses the recorded branch diff after the PR is merged or closed', () => {
    expect(shouldUseRecordedBranchDiff('jait/feature', 'merged')).toBe(true)
    expect(shouldUseRecordedBranchDiff('jait/feature', 'closed')).toBe(true)
  })

  it('does not use recorded branch diffs without a thread branch', () => {
    expect(shouldUseRecordedBranchDiff(null, 'open')).toBe(false)
  })
})

describe('getThreadDiffRequest', () => {
  it('uses the current branch diff before PR creation', () => {
    expect(getThreadDiffRequest('main', 'jait/feature', null)).toEqual({ baseBranch: 'main' })
  })

  it('pins diff stats to the recorded branch while the PR is being created', () => {
    expect(getThreadDiffRequest('main', 'jait/feature', 'creating')).toEqual({
      baseBranch: 'main',
      branch: 'jait/feature',
    })
  })

  it('pins diff stats to the recorded branch while the PR is open', () => {
    expect(getThreadDiffRequest('main', 'jait/feature', 'open')).toEqual({
      baseBranch: 'main',
      branch: 'jait/feature',
    })
  })

  it('pins diff stats to the recorded branch after merge and close', () => {
    expect(getThreadDiffRequest('main', 'jait/feature', 'merged')).toEqual({
      baseBranch: 'main',
      branch: 'jait/feature',
    })
    expect(getThreadDiffRequest('main', 'jait/feature', 'closed')).toEqual({
      baseBranch: 'main',
      branch: 'jait/feature',
    })
  })

  it('returns no branch-scoped diff request when the thread branch is missing', () => {
    expect(getThreadDiffRequest('main', null, 'open')).toEqual({})
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
