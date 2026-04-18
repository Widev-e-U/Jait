import { useEffect, useRef, useState } from 'react'
import { Check, FileText, Undo2, ExternalLink } from 'lucide-react'
import { FileIcon } from '@/components/icons/file-icons'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type FileChangeState = 'undecided' | 'accepted' | 'rejected'

export interface ChangedFile {
  path: string
  name: string
  state: FileChangeState
}

interface FilesChangedProps {
  files: ChangedFile[]
  onAccept?: (path: string) => void
  onReject?: (path: string) => void
  onAcceptAll?: () => void
  onRejectAll?: () => void
  /** Open the diff view for a file */
  onFileClick?: (path: string) => void
  className?: string
}

export function FilesChanged({
  files,
  onAccept,
  onReject,
  onAcceptAll,
  onRejectAll,
  onFileClick,
  className,
}: FilesChangedProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [compactActions, setCompactActions] = useState(false)

  useEffect(() => {
    const node = rootRef.current
    if (!node || typeof ResizeObserver === 'undefined') return

    const updateLayout = () => {
      setCompactActions(node.clientWidth < 560)
    }

    updateLayout()

    const observer = new ResizeObserver(() => updateLayout())
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  if (files.length === 0) return null

  const undecided = files.filter((f) => f.state === 'undecided').length

  return (
    <div ref={rootRef} className={cn('overflow-hidden rounded-lg border bg-muted/30', className)}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b bg-muted/20 px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="truncate text-xs font-medium">
            Files changed ({files.length})
          </span>
          {undecided > 0 && (
            <span className="shrink-0 text-2xs text-amber-500 dark:text-amber-400">
              {undecided} pending
            </span>
          )}
        </div>
        {undecided > 0 && (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Button
              size={compactActions ? 'icon' : 'sm'}
              variant="ghost"
              className={cn('h-6 shrink-0 text-xs', compactActions ? 'w-6 p-0' : 'px-2')}
              onClick={onAcceptAll}
              title="Keep all"
              aria-label="Keep all"
            >
              <Check className={cn('h-3 w-3 shrink-0', !compactActions && 'mr-1')} />
              {!compactActions && 'Keep all'}
            </Button>
            <Button
              size={compactActions ? 'icon' : 'sm'}
              variant="ghost"
              className={cn('h-6 shrink-0 text-xs', compactActions ? 'w-6 p-0' : 'px-2')}
              onClick={onRejectAll}
              title="Undo all"
              aria-label="Undo all"
            >
              <Undo2 className={cn('h-3 w-3 shrink-0', !compactActions && 'mr-1')} />
              {!compactActions && 'Undo all'}
            </Button>
          </div>
        )}
      </div>

      {/* File list */}
      <div className="divide-y">
        {files.map((file) => (
          <div
            key={file.path}
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 text-xs',
              file.state === 'accepted' && 'bg-green-500/5',
              file.state === 'rejected' && 'bg-red-500/5 text-muted-foreground',
            )}
          >
            <FileIcon filename={file.name} className="h-3.5 w-3.5 shrink-0" />
            <button
              type="button"
              className={cn(
                'min-w-0 flex-1 truncate text-left hover:underline cursor-pointer',
                file.state === 'rejected' && 'line-through',
              )}
              title={`Review diff for ${file.path}`}
              onClick={() => onFileClick?.(file.path)}
            >
              {file.path}
            </button>

            {file.state === 'undecided' && (
              <div className="ml-auto flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  className="p-1 rounded hover:bg-primary/10 text-primary transition-colors"
                  onClick={() => onFileClick?.(file.path)}
                  title="Review changes"
                >
                  <ExternalLink className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="p-1 rounded hover:bg-green-500/20 text-green-600 dark:text-green-400 transition-colors"
                  onClick={() => onAccept?.(file.path)}
                  title="Keep all changes"
                >
                  <Check className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="p-1 rounded hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-colors"
                  onClick={() => onReject?.(file.path)}
                  title="Undo all changes"
                >
                  <Undo2 className="h-3 w-3" />
                </button>
              </div>
            )}
            {file.state === 'accepted' && (
              <span className="text-2xs text-green-600 dark:text-green-400 shrink-0">Kept</span>
            )}
            {file.state === 'rejected' && (
              <span className="text-2xs text-red-500 shrink-0">Undone</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
