import { useMemo } from 'react'
import { FileIcon } from '@/components/icons/file-icons'
import { ReadOnlyDiffView } from '@/components/diff/read-only-diff-view'
import { workspaceLanguageForPath } from '@/components/workspace/workspace-panel'
import { cn } from '@/lib/utils'

interface EditDiffViewProps {
  /** File path that was edited */
  filePath: string
  /** For file.patch: the original search text */
  oldText?: string
  /** For file.patch: the replacement text */
  newText?: string
  /** For file.write: the full written content (no diff, just show preview) */
  writtenContent?: string
  /** Whether this is a new file creation */
  isNewFile?: boolean
  className?: string
}

export function EditDiffView({
  filePath,
  oldText,
  newText,
  writtenContent,
  isNewFile,
  className,
}: EditDiffViewProps) {
  const fileName = filePath.split('/').pop() ?? filePath
  const language = workspaceLanguageForPath(filePath)

  const diffContent = useMemo(() => {
    if (oldText != null && newText != null) {
      return { original: oldText, modified: newText }
    }
    if (writtenContent != null) {
      return { original: '', modified: writtenContent }
    }
    return null
  }, [oldText, newText, writtenContent, isNewFile])

  if (!diffContent) return null

  return (
    <div className={cn('rounded-md border bg-background overflow-hidden', className)}>
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/40 border-b">
        <FileIcon filename={fileName} className="h-3.5 w-3.5 shrink-0" />
        <span className="text-xs font-mono text-muted-foreground truncate">
          {filePath}
        </span>
      </div>
      <ReadOnlyDiffView
        original={diffContent.original}
        modified={diffContent.modified}
        language={language}
        className="h-80"
        editorClassName="h-full"
        emptyMessage={isNewFile ? 'New file contents.' : 'No visible changes.'}
        options={{
          renderSideBySide: false,
          lineNumbers: 'on',
          wordWrap: 'on',
        }}
      />
    </div>
  )
}
