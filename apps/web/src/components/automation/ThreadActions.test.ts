import { describe, expect, it } from 'vitest'
import type { GitStatusResult } from '@/lib/git-api'
import { shouldShowThreadChangesButton } from './thread-actions-state'

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
  it('hides terminal PR changes when the thread branch is gone', () => {
    expect(shouldShowThreadChangesButton(gitStatus({ branch: 'main' }), 'jait/feature', 'merged')).toBe(false)
    expect(shouldShowThreadChangesButton(gitStatus({ branch: 'main' }), 'jait/feature', 'closed')).toBe(false)
    expect(shouldShowThreadChangesButton(gitStatus({ branch: 'main' }), null, 'merged')).toBe(false)
  })

  it('keeps terminal PR changes visible while still on the thread branch', () => {
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
