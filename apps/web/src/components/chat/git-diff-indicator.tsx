import { ArrowDown, ArrowUp, FileDiff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TooltipHint } from '@/components/ui/tooltip'
import { useGitChangeCounts } from '@/lib/git-change-counts'

interface GitDiffIndicatorProps {
  /** Absolute project root used to run `git status`. */
  projectRoot: string | null
  /** Optional connected-node id (windows/desktop) for the git API call. */
  nodeId?: string | null
  /** Bumping this value forces a refetch (e.g. after a source-control refresh). */
  refreshSignal?: number
  /** Opens the editor + source-control tab. */
  onOpen: () => void
  /** Compact (mobile) sizing so the chat header stays uncluttered. */
  compact?: boolean
}

/**
 * Small up/down git-diff pill shown in the top-left of a project chat,
 * mirroring the context-window indicator on the top-right.
 *
 * Counts come from the shared `git-change-counts` store rather than local
 * state, so the same data also drives the source-control icon badges
 * (toolbar, bottom nav, project panel tab). Switching projects swaps the
 * store key, so the pill resets to the newly selected project's totals
 * as soon as they arrive — no stale numbers from the previous project.
 * Clicking opens the project editor with the source-control (Git) tab focused.
 */
export function GitDiffIndicator({ projectRoot, nodeId, refreshSignal, onOpen, compact }: GitDiffIndicatorProps) {
  const counts = useGitChangeCounts(nodeId, projectRoot, refreshSignal ?? 0)
  const fileCount = counts.fileCount
  const insertions = counts.insertions
  const deletions = counts.deletions

  const hasChanges = insertions > 0 || deletions > 0

  return (
    <TooltipHint content={`${fileCount} changed file${fileCount === 1 ? '' : 's'} — open editor & source control`}>
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${fileCount} changed files. Open editor and source control.`}
      className={cn(
        'flex items-center gap-1 rounded-md hover:bg-muted/50 cursor-pointer transition-colors',
        compact ? 'px-1 py-0.5' : 'px-1.5 py-1',
      )}
    >
      <FileDiff className={cn('shrink-0 text-muted-foreground', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
      {hasChanges ? (
        <>
          <span className="flex items-center gap-0.5 tabular-nums">
            <ArrowUp className={cn('shrink-0 text-emerald-600 dark:text-emerald-400', compact ? 'h-2.5 w-2.5' : 'h-3 w-3')} />
            <span className="text-2xs text-foreground">{insertions}</span>
          </span>
          <span className="flex items-center gap-0.5 tabular-nums">
            <ArrowDown className={cn('shrink-0 text-red-600 dark:text-red-400', compact ? 'h-2.5 w-2.5' : 'h-3 w-3')} />
            <span className="text-2xs text-foreground">{deletions}</span>
          </span>
        </>
      ) : (
        <span className="text-2xs text-muted-foreground">0</span>
      )}
    </button>
    </TooltipHint>
  )
}