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
