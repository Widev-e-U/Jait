import type { GitStatusResult } from '@/lib/git-api'

export type WorkspacePrimaryGitAction = 'commit' | 'sync'

export function canSyncChanges(gitStatus: GitStatusResult | null | undefined): boolean {
  if (!gitStatus?.hasUpstream) return false
  return (gitStatus.aheadCount ?? 0) > 0 || (gitStatus.behindCount ?? 0) > 0
}

export function canCommitAndPush(
  changedFileCount: number,
  gitStatus: GitStatusResult | null | undefined,
): boolean {
  if (changedFileCount > 0) return true
  return (gitStatus?.aheadCount ?? 0) > 0
}

export function getPrimaryGitAction(
  changedFileCount: number,
  gitStatus: GitStatusResult | null | undefined,
): WorkspacePrimaryGitAction {
  if (changedFileCount > 0) return 'commit'
  if (canSyncChanges(gitStatus)) return 'sync'
  return 'commit'
}
