/**
 * EditDiffView — shows a unified diff for file edit tool calls.
 *
 * Inspired by VS Code Copilot Chat's inline diff/textEdit rendering.
 * Displays old vs new content as a color-coded unified diff.
 */

import { useMemo } from 'react'
import { FileIcon } from '@/components/icons/file-icons'
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

interface DiffLine {
  type: 'context' | 'add' | 'remove' | 'header'
  content: string
  oldLineNo?: number
  newLineNo?: number
}

/**
 * Generate a minimal unified diff from search/replace strings.
 */
function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const lines: DiffLine[] = []

  // Simple line-by-line diff for search/replace

  // Find common prefix
  let prefixLen = 0
  while (
    prefixLen < oldLines.length &&
    prefixLen < newLines.length &&
    oldLines[prefixLen] === newLines[prefixLen]
  ) {
    prefixLen++
  }

  // Find common suffix
  let suffixLen = 0
  while (
    suffixLen < oldLines.length - prefixLen &&
    suffixLen < newLines.length - prefixLen &&
    oldLines[oldLines.length - 1 - suffixLen] === newLines[newLines.length - 1 - suffixLen]
  ) {
    suffixLen++
  }

  // Show up to 3 context lines before changes
  const contextBefore = Math.min(3, prefixLen)
  const contextAfter = Math.min(3, suffixLen)

  // Header
  lines.push({
    type: 'header',
    content: `@@ -${prefixLen - contextBefore + 1},${oldLines.length - prefixLen - suffixLen + contextBefore + contextAfter} +${prefixLen - contextBefore + 1},${newLines.length - prefixLen - suffixLen + contextBefore + contextAfter} @@`,
  })

  // Context before
  for (let i = prefixLen - contextBefore; i < prefixLen; i++) {
    lines.push({
      type: 'context',
      content: oldLines[i]!,
      oldLineNo: i + 1,
      newLineNo: i + 1,
    })
  }

  // Removed lines
  for (let i = prefixLen; i < oldLines.length - suffixLen; i++) {
    lines.push({
      type: 'remove',
      content: oldLines[i]!,
      oldLineNo: i + 1,
    })
  }

  // Added lines
  const newStart = prefixLen
  const newEnd = newLines.length - suffixLen
  for (let i = newStart; i < newEnd; i++) {
    lines.push({
      type: 'add',
      content: newLines[i]!,
      newLineNo: i + 1,
    })
  }

  // Context after
  for (let i = oldLines.length - suffixLen; i < oldLines.length - suffixLen + contextAfter; i++) {
    if (i < oldLines.length) {
      const newIdx = newLines.length - suffixLen + (i - (oldLines.length - suffixLen))
      lines.push({
        type: 'context',
        content: oldLines[i]!,
        oldLineNo: i + 1,
        newLineNo: newIdx + 1,
      })
    }
  }

  return lines
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

  const diffLines = useMemo(() => {
    if (oldText != null && newText != null) {
      return computeDiff(oldText, newText)
    }
    // For file.write — show as all-addition
    if (writtenContent != null) {
      const contentLines = writtenContent.split('\n')
      const preview = contentLines.slice(0, 50) // Limit preview size
      const lines: DiffLine[] = [
        {
          type: 'header',
          content: isNewFile
            ? `@@ -0,0 +1,${contentLines.length} @@ (new file)`
            : `@@ +1,${contentLines.length} @@ (full write)`,
        },
      ]
      for (let i = 0; i < preview.length; i++) {
        lines.push({
          type: 'add',
          content: preview[i]!,
          newLineNo: i + 1,
        })
      }
      if (contentLines.length > 50) {
        lines.push({
          type: 'context',
          content: `... ${contentLines.length - 50} more lines`,
        })
      }
      return lines
    }
    return []
  }, [oldText, newText, writtenContent, isNewFile])

  if (diffLines.length === 0) return null

  return (
    <div className={cn('rounded-md border overflow-hidden', className)}>
      {/* File header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border-b">
        <FileIcon filename={fileName} className="h-3.5 w-3.5 shrink-0" />
        <span className="text-xs font-mono text-muted-foreground truncate">
          {filePath}
        </span>
      </div>

      {/* Diff body */}
      <div className="overflow-x-auto max-h-80 overflow-y-auto">
        <table className="w-full text-xs font-mono leading-5 border-collapse">
          <tbody>
            {diffLines.map((line, i) => (
              <tr
                key={i}
                className={cn(
                  line.type === 'add' && 'bg-green-500/10',
                  line.type === 'remove' && 'bg-red-500/10',
                  line.type === 'header' && 'bg-blue-500/10',
                )}
              >
                {/* Line numbers */}
                <td className="select-none text-right px-2 text-muted-foreground/40 w-10 align-top shrink-0 border-r border-muted/30">
                  {line.type === 'header'
                    ? ''
                    : line.type === 'add'
                      ? ''
                      : (line.oldLineNo ?? '')}
                </td>
                <td className="select-none text-right px-2 text-muted-foreground/40 w-10 align-top shrink-0 border-r border-muted/30">
                  {line.type === 'header'
                    ? ''
                    : line.type === 'remove'
                      ? ''
                      : (line.newLineNo ?? '')}
                </td>
                {/* Gutter symbol */}
                <td
                  className={cn(
                    'px-1 w-4 select-none text-center align-top',
                    line.type === 'add' && 'text-green-500',
                    line.type === 'remove' && 'text-red-500',
                    line.type === 'header' && 'text-blue-500',
                  )}
                >
                  {line.type === 'add'
                    ? '+'
                    : line.type === 'remove'
                      ? '−'
                      : line.type === 'header'
                        ? '@@'
                        : ' '}
                </td>
                {/* Content */}
                <td className="px-2 whitespace-pre-wrap break-all">
                  {line.type === 'header' ? (
                    <span className="text-blue-500/80 italic">{line.content}</span>
                  ) : (
                    <span
                      className={cn(
                        line.type === 'add' && 'text-green-600 dark:text-green-400',
                        line.type === 'remove' && 'text-red-600 dark:text-red-400 line-through opacity-70',
                      )}
                    >
                      {line.content || '\u00A0'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
