import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, FileDiff } from 'lucide-react'
import { gitApi } from '@/lib/git-api'
import { cn } from '@/lib/utils'

interface GitDiffIndicatorProps {
  /** Absolute project root used to run `git status`. */
  projectRoot: string | null
  /** Optional connected-node id (windows/desktop) for the git API call. */
  nodeId?: string | null
  /** Number of changed files, used for the tooltip/aria-label. */
  fileCount: number
  /** Bumping this value forces a refetch (e.g. after a source-control refresh). */
  refreshSignal?: number
  /** Opens the editor + source-control tab. */
  onOpen: () => void
  /** Compact (mobile) sizing so the chat header stays uncluttered. */
  compact?: boolean
}

const REFRESH_INTERVAL_MS = 15_000

/**
 * Small up/down git-diff pill shown in the top-left of a project chat,
 * mirroring the context-window indicator on the top-right. It fetches
 * `git status` itself so the counts appear as soon as there are changes,
 * regardless of whether the composer's enriched file list has loaded yet.
 * Clicking opens the project editor with the source-control (Git) tab focused.
 */
export function GitDiffIndicator({ projectRoot, nodeId, fileCount, refreshSignal, onOpen, compact }: GitDiffIndicatorProps) {
  const [insertions, setInsertions] = useState(0)
  const [deletions, setDeletions] = useState(0)

  useEffect(() => {
    if (!projectRoot) {
      setInsertions(0)
      setDeletions(0)
      return
    }

    let cancelled = false

    const load = () => {
      gitApi
        .status(projectRoot, undefined, nodeId)
        .then((status) => {
          if (cancelled) return
          setInsertions(status.index.insertions + status.workingTree.insertions)
          setDeletions(status.index.deletions + status.workingTree.deletions)
        })
        .catch(() => {
          if (cancelled) return
          setInsertions(0)
          setDeletions(0)
        })
    }

    load()
    const timer = setInterval(load, REFRESH_INTERVAL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [projectRoot, nodeId, refreshSignal])

  const hasChanges = insertions > 0 || deletions > 0

  return (
    <button
      type="button"
      onClick={onOpen}
      title={`${fileCount} changed file${fileCount === 1 ? '' : 's'} — open editor & source control`}
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
  )
}