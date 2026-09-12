import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildGitActionProgressStages,
  buildMenuItems,
  gitApi,
  isMissingGitIdentityError,
  resolveQuickAction,
  summarizeGitResult,
  type GitStatusResult,
  type GitStepResult,
} from './git-api'

function makeStatus(overrides: Partial<GitStatusResult> = {}): GitStatusResult {
  return {
    branch: 'feature/x',
    hasWorkingTreeChanges: false,
    index: { files: [], insertions: 0, deletions: 0 },
    workingTree: { files: [], insertions: 0, deletions: 0 },
    hasUpstream: true,
    aheadCount: 0,
    behindCount: 0,
    pr: null,
    ghAvailable: false,
    prProvider: 'github',
    remoteUrl: 'https://github.com/example/repo.git',
    ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isMissingGitIdentityError', () => {
  it('matches missing git identity errors for both author and committer flows', () => {
    expect(isMissingGitIdentityError(new Error('Author identity unknown'))).toBe(true)
    expect(isMissingGitIdentityError(new Error('Committer identity unknown'))).toBe(true)
    expect(isMissingGitIdentityError(new Error('fatal: unable to auto-detect email address'))).toBe(true)
    expect(isMissingGitIdentityError(new Error('fatal: no email was given and auto-detection is disabled'))).toBe(true)
    expect(isMissingGitIdentityError(new Error('fatal: no name was given and auto-detection is disabled'))).toBe(true)
    expect(isMissingGitIdentityError('Please tell me who you are.')).toBe(true)
  })

  it('does not match unrelated git errors', () => {
    expect(isMissingGitIdentityError(new Error('nothing to commit, working tree clean'))).toBe(false)
  })
})

describe('gitApi remote node routing', () => {
  it('sends the owning project node with Windows source-control requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => makeStatus(),
    })
    vi.stubGlobal('fetch', fetchMock)

    await gitApi.status('C:\\work\\project', undefined, 'windows-two')

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      cwd: 'C:\\work\\project',
      nodeId: 'windows-two',
    })
  })
})

describe('buildMenuItems', () => {
  it('returns an empty list when status is unavailable', () => {
    expect(buildMenuItems(null, false)).toEqual([])
  })

  it('enables Commit only when there are working-tree changes', () => {
    const items = buildMenuItems(makeStatus({ hasWorkingTreeChanges: true }), false)
    expect(items.find(i => i.id === 'commit')?.disabled).toBe(false)
    expect(items.find(i => i.id === 'push')?.disabled).toBe(true)
    expect(items.find(i => i.id === 'pr')?.disabled).toBe(true)
  })

  it('disables Commit when there is nothing to commit', () => {
    const items = buildMenuItems(makeStatus(), false)
    expect(items.find(i => i.id === 'commit')?.disabled).toBe(true)
  })

  it('enables Push when ahead with a clean tree and no divergence', () => {
    const items = buildMenuItems(makeStatus({ aheadCount: 2 }), false)
    expect(items.find(i => i.id === 'push')?.disabled).toBe(false)
  })

  it('labels the PR item "Open PR" when a PR is open, else "Create PR"', () => {
    const open = buildMenuItems(makeStatus({ pr: { number: 1, title: 't', url: 'u', baseBranch: 'main', headBranch: 'x', state: 'open' } }), false)
    expect(open.find(i => i.id === 'pr')?.label).toBe('Open PR')

    const create = buildMenuItems(makeStatus(), false)
    expect(create.find(i => i.id === 'pr')?.label).toBe('Create PR')
  })

  it('disables all actions while busy', () => {
    const items = buildMenuItems(makeStatus({ hasWorkingTreeChanges: true, aheadCount: 2 }), true)
    for (const item of items) expect(item.disabled).toBe(true)
  })
})

describe('resolveQuickAction', () => {
  it('reports busy and unavailable states', () => {
    expect(resolveQuickAction(makeStatus(), true)).toMatchObject({ label: 'Commit', disabled: true, hint: 'Git action in progress.' })
    expect(resolveQuickAction(null, false)).toMatchObject({ label: 'Commit', disabled: true, hint: 'Git status is unavailable.' })
  })

  it('prompts to create a branch when none exists', () => {
    const action = resolveQuickAction(makeStatus({ branch: null }), false)
    expect(action).toMatchObject({ label: 'Commit', disabled: true, kind: 'show_hint' })
    expect(action.hint).toContain('Create and checkout a branch')
  })

  it('commits & pushes without a PR on the default branch or with an open PR', () => {
    expect(resolveQuickAction(makeStatus({ hasWorkingTreeChanges: true }), false, true)).toMatchObject({
      label: 'Commit & push', kind: 'run_action', action: 'commit_push',
    })
    expect(resolveQuickAction(makeStatus({ hasWorkingTreeChanges: true, pr: { number: 1, title: 't', url: 'u', baseBranch: 'main', headBranch: 'x', state: 'open' } }), false)).toMatchObject({
      label: 'Commit & push', kind: 'run_action', action: 'commit_push',
    })
  })

  it('commits, pushes & creates a PR on a feature branch with changes', () => {
    expect(resolveQuickAction(makeStatus({ hasWorkingTreeChanges: true }), false)).toMatchObject({
      label: 'Commit, push & create PR', kind: 'run_action', action: 'commit_push_pr',
    })
  })

  it('handles the no-upstream branch', () => {
    const noUpstream = makeStatus({ hasUpstream: false })
    expect(resolveQuickAction(noUpstream, false)).toMatchObject({ label: 'Push', disabled: true, kind: 'show_hint', hint: 'No local commits to push.' })
    expect(resolveQuickAction({ ...noUpstream, aheadCount: 1 }, false)).toMatchObject({ label: 'Push & create PR', kind: 'run_action', action: 'commit_push_pr' })
    expect(resolveQuickAction({ ...noUpstream, aheadCount: 1 }, false, true)).toMatchObject({ label: 'Push', kind: 'run_action', action: 'commit_push' })
  })

  it('flags a diverged branch and offers Pull when behind', () => {
    expect(resolveQuickAction(makeStatus({ aheadCount: 1, behindCount: 1 }), false)).toMatchObject({ label: 'Sync branch', disabled: true, kind: 'show_hint' })
    expect(resolveQuickAction(makeStatus({ behindCount: 1 }), false)).toMatchObject({ label: 'Pull', kind: 'run_pull' })
  })

  it('pushes when ahead and up to date with upstream', () => {
    expect(resolveQuickAction(makeStatus({ aheadCount: 1 }), false)).toMatchObject({ label: 'Push & create PR', kind: 'run_action', action: 'commit_push_pr' })
    expect(resolveQuickAction(makeStatus({ aheadCount: 1 }), false, true)).toMatchObject({ label: 'Push', kind: 'run_action', action: 'commit_push' })
  })

  it('offers to open an existing PR and reports an up-to-date branch', () => {
    expect(resolveQuickAction(makeStatus({ pr: { number: 1, title: 't', url: 'u', baseBranch: 'main', headBranch: 'x', state: 'open' } }), false)).toMatchObject({ label: 'Open PR', kind: 'open_pr' })
    expect(resolveQuickAction(makeStatus(), false)).toMatchObject({ label: 'Commit', disabled: true, kind: 'show_hint', hint: 'Branch is up to date. No action needed.' })
  })
})

describe('buildGitActionProgressStages', () => {
  const base = { action: 'commit_push' as const, hasCustomCommitMessage: false, hasWorkingTreeChanges: true }

  it('builds commit stages for a plain commit', () => {
    expect(buildGitActionProgressStages({ ...base, action: 'commit' })).toEqual(['Generating commit message...', 'Committing...'])
  })

  it('appends push and PR stages for stacked actions', () => {
    expect(buildGitActionProgressStages(base)).toEqual(['Generating commit message...', 'Committing...', 'Pushing...'])
    expect(buildGitActionProgressStages({ ...base, action: 'commit_push_pr' })).toEqual(['Generating commit message...', 'Committing...', 'Pushing...', 'Creating PR...'])
  })

  it('skips commit stages when force-pushing only', () => {
    expect(buildGitActionProgressStages({ ...base, forcePushOnly: true })).toEqual(['Pushing...'])
  })

  it('uses a single commit stage when a custom message is provided', () => {
    expect(buildGitActionProgressStages({ ...base, hasCustomCommitMessage: true })).toEqual(['Committing...', 'Pushing...'])
  })

  it('prepends a feature-branch stage when requested', () => {
    expect(buildGitActionProgressStages({ ...base, featureBranch: true })).toEqual(['Preparing feature branch...', 'Generating commit message...', 'Committing...', 'Pushing...'])
  })
})

describe('summarizeGitResult', () => {
  const step = (overrides: Partial<GitStepResult>): GitStepResult => ({
    commit: { status: 'created', commitSha: 'abc1234', subject: 'feat: thing' },
    push: { status: 'pushed', branch: 'feature/x', upstreamBranch: 'origin/feature/x' },
    branch: { status: 'skipped_not_requested' },
    pr: { status: 'skipped_not_requested' },
    ...overrides,
  })

  it('summarizes a commit when there is no remote', () => {
    const result = summarizeGitResult(step({ push: { status: 'skipped_no_remote' } }))
    expect(result.title).toBe('Committed abc1234')
    expect(result.description).toContain('No remote configured')
  })

  it('summarizes created and reopened PRs', () => {
    expect(summarizeGitResult(step({ pr: { status: 'created', number: 42, title: 'Add tests', baseBranch: 'main', headBranch: 'x' } }))).toMatchObject({ title: 'Created PR #42', description: 'Add tests' })
    expect(summarizeGitResult(step({ pr: { status: 'opened_existing', number: 7, title: 'Reopen', baseBranch: 'main', headBranch: 'x' } }))).toMatchObject({ title: 'Opened PR #7' })
  })

  it('summarizes a successful push', () => {
    const result = summarizeGitResult(step({}))
    expect(result.title).toBe('Pushed abc1234 to origin/feature/x')
    expect(result.description).toBe('feat: thing')
  })

  it('summarizes a local commit and falls back to Done', () => {
    expect(summarizeGitResult(step({ push: { status: 'skipped_not_requested' } }))).toMatchObject({ title: 'Committed abc1234', description: 'feat: thing' })
    expect(summarizeGitResult(step({ commit: { status: 'skipped_no_changes' }, push: { status: 'skipped_not_requested' } }))).toEqual({ title: 'Done' })
  })
})
