import type { GitStatusResult } from '@/lib/git-api'

export type ThreadPrState = 'creating' | 'open' | 'closed' | 'merged' | null | undefined

export function shouldUseRecordedBranchDiff(
  threadBranch: string | null | undefined,
  prState: ThreadPrState,
  threadStatus?: string,
  gitStatus?: Pick<GitStatusResult, 'branch' | 'hasWorkingTreeChanges'> | null,
): boolean {
  if (!threadBranch) return false
  if (prState === 'creating' || prState === 'open' || prState === 'merged' || prState === 'closed') return true
  if (threadStatus === 'completed') {
    return !(gitStatus?.branch === threadBranch && gitStatus.hasWorkingTreeChanges)
  }
  return false
}

export function getThreadDiffRequest(
  baseBranch: string,
  threadBranch: string | null | undefined,
  prState: ThreadPrState,
  threadStatus?: string,
  gitStatus?: Pick<GitStatusResult, 'branch' | 'hasWorkingTreeChanges'> | null,
): { baseBranch?: string; branch?: string } {
  if (!threadBranch) return {}
  if (shouldUseRecordedBranchDiff(threadBranch, prState, threadStatus, gitStatus)) {
    return { baseBranch, branch: threadBranch }
  }
  return { baseBranch }
}

export function shouldRefreshThreadChangeTotals(prState: ThreadPrState): boolean {
  return prState !== 'creating'
}

export function getRecordedThreadChangeTotals(
  changeFiles: number | null | undefined,
  changeInsertions: number | null | undefined,
  changeDeletions: number | null | undefined,
): { insertions: number; deletions: number; hasChanges: boolean } | null {
  if (changeFiles == null || changeInsertions == null || changeDeletions == null) return null
  return {
    insertions: changeInsertions,
    deletions: changeDeletions,
    hasChanges: changeFiles > 0,
  }
}

export function shouldShowThreadChangesButton(
  gitStatus: GitStatusResult | null,
  threadBranch: string | null | undefined,
  prState: ThreadPrState,
): boolean {
  if (!gitStatus) return false
  if (gitStatus.hasWorkingTreeChanges) return true

  const isTerminalPr = prState === 'merged' || prState === 'closed'
  if (!isTerminalPr) return true

  return Boolean(threadBranch)
}

export function shouldRenderThreadActions({
  hasRepository,
  threadKind,
  threadStatus,
  threadBranch,
  prUrl,
  prState,
}: {
  hasRepository: boolean
  threadKind: 'delivery' | 'delegation'
  threadStatus: string
  threadBranch?: string | null
  prUrl?: string | null
  prState: ThreadPrState
}): boolean {
  if (!hasRepository || threadKind !== 'delivery') return false
  return Boolean(
    threadBranch ||
    threadStatus === 'completed' ||
    prUrl ||
    prState === 'creating' ||
    prState === 'open',
  )
}
