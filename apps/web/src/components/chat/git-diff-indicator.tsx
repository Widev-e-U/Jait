import { ArrowDown, ArrowUp, FileDiff } from 'lucide-react'
import { cn } from '@/lib/utils'

interface GitDiffIndicatorProps {
  /** Number of changed files. */
  count: number
  /** Total insertions across changed files. */
  insertions: number
  /** Total deletions across changed files. */
  deletions: number
  /** Opens the editor + source-control tab. */
  onOpen: () => void
  /** Compact (mobile) sizing so the chat header stays uncluttered. */
  compact?: boolean
}

/**
 * Small up/down git-diff pill shown in the top-left of a project chat,
 * mirroring the context-window indicator on the top-right. Clicking opens the
 * project editor with the source-control (Git) tab focused.
 */
export function GitDiffIndicator({ count, insertions, deletions, onOpen, compact }: GitDiffIndicatorProps) {
  const hasChanges = insertions > 0 || deletions > 0

  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${count} changed file${count === 1 ? '' : 's'} — open editor & source control`}
      aria-label={`${count} changed files. Open editor and source control.`}
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
  )
}
