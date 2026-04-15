import type { GitStatusResult } from '@/lib/git-api'

export type ThreadPrState = 'creating' | 'open' | 'closed' | 'merged' | null | undefined

export function shouldShowThreadChangesButton(
  gitStatus: GitStatusResult | null,
  threadBranch: string | null | undefined,
  prState: ThreadPrState,
): boolean {
  if (!gitStatus) return false
  if (gitStatus.hasWorkingTreeChanges) return true

  const isTerminalPr = prState === 'merged' || prState === 'closed'
  if (!isTerminalPr) return true

  return Boolean(threadBranch && gitStatus.branch === threadBranch)
}
