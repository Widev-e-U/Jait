import type { GitStatusResult } from '@/lib/git-api'

export type ThreadPrState = 'creating' | 'open' | 'closed' | 'merged' | null | undefined

export function shouldUseRecordedBranchDiff(
  threadBranch: string | null | undefined,
  prState: ThreadPrState,
): boolean {
  if (!threadBranch) return false
  return prState === 'creating' || prState === 'open' || prState === 'merged' || prState === 'closed'
}

export function getThreadDiffRequest(
  baseBranch: string,
  threadBranch: string | null | undefined,
  prState: ThreadPrState,
): { baseBranch?: string; branch?: string } {
  if (!threadBranch) return {}
  if (shouldUseRecordedBranchDiff(threadBranch, prState)) {
    return { baseBranch, branch: threadBranch }
  }
  return { baseBranch }
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
