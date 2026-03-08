/**
 * Git API client — talks to /api/git/* on the Jait gateway.
 *
 * Mirrors the t3code gitReactQuery pattern but uses HTTP instead of IPC.
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// ── Types (matching gateway GitService) ──────────────────────────────

export type GitStackedAction = 'commit' | 'commit_push' | 'commit_push_pr'

export interface GitStatusFile {
  path: string
  insertions: number
  deletions: number
}

export interface GitStatusPr {
  number: number
  title: string
  url: string
  baseBranch: string
  headBranch: string
  state: 'open' | 'closed' | 'merged'
}

export interface GitStatusResult {
  branch: string | null
  hasWorkingTreeChanges: boolean
  workingTree: {
    files: GitStatusFile[]
    insertions: number
    deletions: number
  }
  hasUpstream: boolean
  aheadCount: number
  behindCount: number
  pr: GitStatusPr | null
}

export interface GitBranch {
  name: string
  isRemote: boolean
  current: boolean
  isDefault: boolean
  worktreePath: string | null
}

export interface GitListBranchesResult {
  branches: GitBranch[]
  isRepo: boolean
}

export interface GitStepResult {
  commit: { status: 'created' | 'skipped_no_changes'; commitSha?: string; subject?: string }
  push: { status: 'pushed' | 'skipped_not_requested' | 'skipped_up_to_date' | 'skipped_no_remote'; branch?: string; upstreamBranch?: string; setUpstream?: boolean; createPrUrl?: string }
  branch: { status: 'created' | 'skipped_not_requested'; name?: string }
  pr: { status: 'created' | 'opened_existing' | 'skipped_not_requested' | 'skipped_no_remote'; url?: string; number?: number; baseBranch?: string; headBranch?: string; title?: string }
}

export interface GitDiffResult {
  diff: string
  files: string[]
  hasChanges: boolean
}

export interface FileDiffEntry {
  path: string
  /** Original (HEAD) content, empty for new files */
  original: string
  /** Current working-tree content, empty for deleted files */
  modified: string
  /** 'A' = added, 'M' = modified, 'D' = deleted, 'R' = renamed, '?' = untracked */
  status: string
}

export interface GitPullResult {
  status: 'pulled' | 'skipped_up_to_date'
  branch: string
  upstreamBranch: string | null
}

export interface GitWorktreeResult {
  path: string
  branch: string
}

// ── Helpers ──────────────────────────────────────────────────────────

function getToken(): string | null {
  return localStorage.getItem('token')
}

function authHeaders(json = false): HeadersInit {
  const h: HeadersInit = {}
  if (json) h['Content-Type'] = 'application/json'
  const token = getToken()
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

async function gitPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}/api/git/${path}`, {
    method: 'POST',
    headers: authHeaders(true),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>
    throw new Error((err.error as string) || `Git ${path} failed: ${res.statusText}`)
  }
  return res.json() as Promise<T>
}

// ── Public API ───────────────────────────────────────────────────────

export const gitApi = {
  status(cwd: string, branch?: string, opts?: { githubToken?: string }): Promise<GitStatusResult> {
    return gitPost<GitStatusResult>('status', {
      cwd,
      ...(branch ? { branch } : {}),
      ...(opts?.githubToken ? { githubToken: opts.githubToken } : {}),
    })
  },

  listBranches(cwd: string): Promise<GitListBranchesResult> {
    return gitPost<GitListBranchesResult>('branches', { cwd })
  },

  pull(cwd: string): Promise<GitPullResult> {
    return gitPost<GitPullResult>('pull', { cwd })
  },

  runStackedAction(
    cwd: string,
    action: GitStackedAction,
    opts?: { commitMessage?: string; featureBranch?: boolean; baseBranch?: string; githubToken?: string },
  ): Promise<GitStepResult> {
    return gitPost<GitStepResult>('run-stacked-action', {
      cwd,
      action,
      ...(opts?.commitMessage ? { commitMessage: opts.commitMessage } : {}),
      ...(opts?.featureBranch ? { featureBranch: true } : {}),
      ...(opts?.baseBranch ? { baseBranch: opts.baseBranch } : {}),
      ...(opts?.githubToken ? { githubToken: opts.githubToken } : {}),
    })
  },

  checkout(cwd: string, branch: string): Promise<void> {
    return gitPost<void>('checkout', { cwd, branch })
  },

  createBranch(
    cwd: string,
    branch: string,
    baseBranch?: string,
  ): Promise<{ ok: boolean; branch: string }> {
    return gitPost<{ ok: boolean; branch: string }>('create-branch', { cwd, branch, baseBranch })
  },

  init(cwd: string): Promise<void> {
    return gitPost<void>('init', { cwd })
  },

  diff(cwd: string): Promise<GitDiffResult> {
    return gitPost<GitDiffResult>('diff', { cwd })
  },

  fileDiffs(cwd: string, baseBranch?: string): Promise<FileDiffEntry[]> {
    return gitPost<{ files: FileDiffEntry[] }>('file-diffs', { cwd, ...(baseBranch ? { baseBranch } : {}) }).then(r => r.files)
  },

  createWorktree(
    cwd: string,
    baseBranch: string,
    newBranch: string,
    path?: string,
  ): Promise<GitWorktreeResult> {
    return gitPost<GitWorktreeResult>('create-worktree', { cwd, baseBranch, newBranch, ...(path ? { path } : {}) })
  },

  removeWorktree(cwd: string, path: string, force = false): Promise<void> {
    return gitPost<void>('remove-worktree', { cwd, path, force })
  },
}

// ── Logic helpers (adapted from t3code GitActionsControl.logic) ──────

export type GitActionIconName = 'commit' | 'push' | 'pr'
export type GitDialogAction = 'commit' | 'push' | 'create_pr'

export interface GitActionMenuItem {
  id: 'commit' | 'push' | 'pr'
  label: string
  disabled: boolean
  icon: GitActionIconName
  kind: 'open_dialog' | 'open_pr'
  dialogAction?: GitDialogAction
}

export interface GitQuickAction {
  label: string
  disabled: boolean
  kind: 'run_action' | 'run_pull' | 'open_pr' | 'show_hint'
  action?: GitStackedAction
  hint?: string
}

export function buildMenuItems(
  gitStatus: GitStatusResult | null,
  isBusy: boolean,
): GitActionMenuItem[] {
  if (!gitStatus) return []

  const hasBranch = gitStatus.branch !== null
  const hasChanges = gitStatus.hasWorkingTreeChanges
  const hasOpenPr = gitStatus.pr?.state === 'open'
  const isBehind = gitStatus.behindCount > 0
  const canCommit = !isBusy && hasChanges
  const canPush = !isBusy && hasBranch && !hasChanges && !isBehind && gitStatus.aheadCount > 0
  const canCreatePr = !isBusy && hasBranch && !hasChanges && !hasOpenPr && gitStatus.aheadCount > 0 && !isBehind
  const canOpenPr = !isBusy && hasOpenPr

  return [
    { id: 'commit', label: 'Commit', disabled: !canCommit, icon: 'commit', kind: 'open_dialog', dialogAction: 'commit' },
    { id: 'push', label: 'Push', disabled: !canPush, icon: 'push', kind: 'open_dialog', dialogAction: 'push' },
    hasOpenPr
      ? { id: 'pr', label: 'Open PR', disabled: !canOpenPr, icon: 'pr', kind: 'open_pr' }
      : { id: 'pr', label: 'Create PR', disabled: !canCreatePr, icon: 'pr', kind: 'open_dialog', dialogAction: 'create_pr' },
  ]
}

export function resolveQuickAction(
  gitStatus: GitStatusResult | null,
  isBusy: boolean,
  isDefaultBranch = false,
): GitQuickAction {
  if (isBusy) return { label: 'Commit', disabled: true, kind: 'show_hint', hint: 'Git action in progress.' }
  if (!gitStatus) return { label: 'Commit', disabled: true, kind: 'show_hint', hint: 'Git status is unavailable.' }

  const hasBranch = gitStatus.branch !== null
  const hasChanges = gitStatus.hasWorkingTreeChanges
  const hasOpenPr = gitStatus.pr?.state === 'open'
  const isAhead = gitStatus.aheadCount > 0
  const isBehind = gitStatus.behindCount > 0

  if (!hasBranch) return { label: 'Commit', disabled: true, kind: 'show_hint', hint: 'Create and checkout a branch before pushing or opening a PR.' }

  if (hasChanges) {
    if (hasOpenPr || isDefaultBranch) return { label: 'Commit & push', disabled: false, kind: 'run_action', action: 'commit_push' }
    return { label: 'Commit, push & create PR', disabled: false, kind: 'run_action', action: 'commit_push_pr' }
  }

  if (!gitStatus.hasUpstream) {
    if (!isAhead) {
      if (hasOpenPr) return { label: 'Open PR', disabled: false, kind: 'open_pr' }
      return { label: 'Push', disabled: true, kind: 'show_hint', hint: 'No local commits to push.' }
    }
    if (hasOpenPr || isDefaultBranch) return { label: 'Push', disabled: false, kind: 'run_action', action: 'commit_push' }
    return { label: 'Push & create PR', disabled: false, kind: 'run_action', action: 'commit_push_pr' }
  }

  if (isAhead && isBehind) return { label: 'Sync branch', disabled: true, kind: 'show_hint', hint: 'Branch has diverged from upstream. Rebase/merge first.' }
  if (isBehind) return { label: 'Pull', disabled: false, kind: 'run_pull' }

  if (isAhead) {
    if (hasOpenPr || isDefaultBranch) return { label: 'Push', disabled: false, kind: 'run_action', action: 'commit_push' }
    return { label: 'Push & create PR', disabled: false, kind: 'run_action', action: 'commit_push_pr' }
  }

  if (hasOpenPr && gitStatus.hasUpstream) return { label: 'Open PR', disabled: false, kind: 'open_pr' }

  return { label: 'Commit', disabled: true, kind: 'show_hint', hint: 'Branch is up to date. No action needed.' }
}

export function buildGitActionProgressStages(input: {
  action: GitStackedAction
  hasCustomCommitMessage: boolean
  hasWorkingTreeChanges: boolean
  forcePushOnly?: boolean
  pushTarget?: string
  featureBranch?: boolean
}): string[] {
  const branchStages = input.featureBranch ? ['Preparing feature branch...'] : []
  const shouldIncludeCommitStages = !input.forcePushOnly && (input.action === 'commit' || input.hasWorkingTreeChanges)
  const commitStages = !shouldIncludeCommitStages ? [] : input.hasCustomCommitMessage ? ['Committing...'] : ['Generating commit message...', 'Committing...']
  const pushStage = input.pushTarget ? `Pushing to ${input.pushTarget}...` : 'Pushing...'
  if (input.action === 'commit') return [...branchStages, ...commitStages]
  if (input.action === 'commit_push') return [...branchStages, ...commitStages, pushStage]
  return [...branchStages, ...commitStages, pushStage, 'Creating PR...']
}

export function summarizeGitResult(result: GitStepResult): { title: string; description?: string } {
  if (result.push.status === 'skipped_no_remote') {
    const sha = result.commit.commitSha?.slice(0, 7)
    return {
      title: sha ? `Committed ${sha}` : 'Committed changes',
      description: 'No remote configured — push skipped. Add a remote with `git remote add <name> <url>` to enable push & PR.',
    }
  }
  if (result.pr.status === 'created' || result.pr.status === 'opened_existing') {
    const prNumber = result.pr.number ? ` #${result.pr.number}` : ''
    const title = `${result.pr.status === 'created' ? 'Created PR' : 'Opened PR'}${prNumber}`
    return result.pr.title ? { title, description: result.pr.title.slice(0, 72) } : { title }
  }
  if (result.push.status === 'pushed') {
    const sha = result.commit.commitSha?.slice(0, 7)
    const branch = result.push.upstreamBranch ?? result.push.branch
    return { title: `Pushed${sha ? ` ${sha}` : ''}${branch ? ` to ${branch}` : ''}`, description: result.commit.subject?.slice(0, 72) }
  }
  if (result.commit.status === 'created') {
    const sha = result.commit.commitSha?.slice(0, 7)
    return { title: sha ? `Committed ${sha}` : 'Committed changes', description: result.commit.subject?.slice(0, 72) }
  }
  return { title: 'Done' }
}
