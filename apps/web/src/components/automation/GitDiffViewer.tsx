/**
 * GitDiffViewer — Monaco-based per-file diff viewer for Manager mode.
 *
 * Fetches per-file original/modified content and renders a read-only
 * Monaco DiffEditor with a file selector sidebar.
 */

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Loader2, X, FileCode, FilePlus, FileX, FileEdit } from 'lucide-react'
import { gitApi, type FileDiffEntry } from '@/lib/git-api'
import { projectLanguageForPath } from '@/components/project'
import { ReadOnlyDiffView, type DiffLineSelection } from '@/components/diff/read-only-diff-view'
import { Textarea } from '@/components/ui/textarea'
import { agentsApi } from '@/lib/agents-api'
import { toast } from 'sonner'
import { formatDiffFeedback, makeDiffFeedbackAnchor, type DiffFeedbackAnchor } from './diff-feedback'
import { TooltipHint } from '@/components/ui/tooltip'

interface GitDiffViewerProps {
  cwd: string
  /** When provided, diffs are scoped to changes since this branch (thread-scoped). */
  baseBranch?: string
  /** When provided with baseBranch, diffs compare baseBranch..branch instead of working tree. */
  branch?: string
  onClose: () => void
  /** Enables feedback addressed to the thread whose changes are being reviewed. */
  threadId?: string
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'A':
    case '?':
      return <FilePlus className="h-3.5 w-3.5 text-green-500 shrink-0" />
    case 'D':
      return <FileX className="h-3.5 w-3.5 text-red-500 shrink-0" />
    case 'R':
      return <FileEdit className="h-3.5 w-3.5 text-blue-500 shrink-0" />
    default:
      return <FileCode className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'A': return 'Added'
    case '?': return 'Untracked'
    case 'D': return 'Deleted'
    case 'R': return 'Renamed'
    default: return 'Modified'
  }
}

export function GitDiffViewer({ cwd, baseBranch, branch, onClose, threadId }: GitDiffViewerProps) {
  const [selection, setSelection] = useState<DiffLineSelection | null>(null)
  const [anchor, setAnchor] = useState<DiffFeedbackAnchor | null>(null)
  const [draftContext, setDraftContext] = useState<{ threadId: string; baseBranch?: string; branch?: string } | null>(null)
  const [feedback, setFeedback] = useState('')
  const [sending, setSending] = useState(false)
  const [files, setFiles] = useState<FileDiffEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 960)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    gitApi.fileDiffs(cwd, baseBranch, branch).then(result => {
      if (cancelled) return
      setFiles(result)
      setSelectedIndex(0)
    }).catch(() => {
      if (!cancelled) setFiles([])
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [baseBranch, branch, cwd])

  useEffect(() => {
    const update = () => setIsNarrow(window.innerWidth < 960)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => { setSelection(null) }, [selectedIndex, files, cwd, baseBranch, branch])

  const selected = files[selectedIndex] ?? null
  const language = selected ? projectLanguageForPath(selected.path) : 'plaintext'

  const sendFeedback = async () => {
    if (!draftContext || !anchor || !feedback.trim() || sending) return
    setSending(true)
    try {
      await agentsApi.sendTurn(draftContext.threadId, formatDiffFeedback(anchor, feedback, draftContext.baseBranch, draftContext.branch))
      setAnchor(null)
      setDraftContext(null)
      setFeedback('')
      toast.success('Feedback sent to the thread')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send feedback')
    } finally {
      setSending(false)
    }
  }

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.target instanceof Element && e.target.closest('textarea, input, .monaco-editor')) {
      return
    } else if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, files.length - 1))
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    }
  }, [onClose, files.length])

  return (
    <div
      className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="bg-popover border rounded-lg shadow-xl w-full max-w-6xl h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0">
          <div className="flex items-center gap-2">
            <FileCode className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Changes</h3>
            {!loading && (
              <span className="text-xs text-muted-foreground">
                {files.length} file{files.length !== 1 ? 's' : ''} changed
              </span>
            )}
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : files.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            No changes detected.
          </div>
        ) : (
          <div className={cn('flex-1 flex min-h-0', isNarrow && 'flex-col')}>
            {/* File list sidebar */}
            <div className={cn('border-r flex flex-col shrink-0 bg-muted/20', isNarrow ? 'w-full border-r-0 border-b max-h-40' : 'w-56')}>
              <div className="px-3 py-2 border-b">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Files</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                {files.map((f, i) => (
                  <TooltipHint key={f.path} content={`${f.path} (${statusLabel(f.status)})`}>
                  <button
                    className={cn(
                      'flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs hover:bg-accent/50 transition-colors',
                      i === selectedIndex && 'bg-accent',
                    )}
                    onClick={() => { setSelectedIndex(i); setSelection(null) }}
                  >
                    <StatusIcon status={f.status} />
                    <span className="truncate font-mono">{f.path.split(/[/\\]/).pop()}</span>
                  </button>
                  </TooltipHint>
                ))}
              </div>
            </div>

            {/* Monaco diff editor */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* File path bar */}
              <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/10 shrink-0">
                <StatusIcon status={selected?.status ?? 'M'} />
                <span className="text-xs font-mono text-muted-foreground truncate">{selected?.path}</span>
                <span className={cn(
                  'text-2xs px-1.5 py-0.5 rounded font-medium',
                  selected?.status === 'A' || selected?.status === '?' ? 'bg-green-500/10 text-green-500' :
                  selected?.status === 'D' ? 'bg-red-500/10 text-red-500' :
                  'bg-yellow-500/10 text-yellow-500',
                )}>
                  {statusLabel(selected?.status ?? 'M')}
                </span>
              </div>

              {threadId && (
                <div className="flex items-center gap-2 border-b px-3 py-1.5 text-xs">
                  <span className="min-w-0 flex-1 text-muted-foreground">
                    {selection ? `${selection.side === 'original' ? 'Original' : 'Modified'} line${selection.startLine === selection.endLine ? ` ${selection.startLine}` : `s ${selection.startLine}–${selection.endLine}`}` : 'Select a line or range in the diff'}
                  </span>
                  <Button size="sm" variant="outline" disabled={!selection || !!anchor} onClick={() => {
                    if (selected && selection && threadId) {
                      setAnchor(makeDiffFeedbackAnchor(selected.path, selection.side === 'original' ? selected.original : selected.modified, selection))
                      setDraftContext({ threadId, baseBranch, branch })
                    }
                  }}>Add feedback</Button>
                </div>
              )}
              {anchor && (
                <div className="space-y-2 border-b p-3">
                  <div className="break-all text-xs text-muted-foreground">{anchor.path} · {anchor.side} · {anchor.startLine === anchor.endLine ? `line ${anchor.startLine}` : `lines ${anchor.startLine}–${anchor.endLine}`}</div>
                  <Textarea aria-label="Review feedback" placeholder="What should the agent change?" value={feedback} onChange={event => setFeedback(event.target.value)} disabled={sending} />
                  <div className="flex gap-2">
                    <Button size="sm" disabled={!feedback.trim() || sending} onClick={() => void sendFeedback()}>{sending ? 'Sending…' : 'Send to thread'}</Button>
                    <Button size="sm" variant="ghost" disabled={sending} onClick={() => { setAnchor(null); setDraftContext(null); setFeedback('') }}>Cancel</Button>
                  </div>
                </div>
              )}

              {/* Editor */}
              <div className="flex-1 min-h-0">
                {selected && (
                  <ReadOnlyDiffView
                    key={selected.path}
                    original={selected.original}
                    modified={selected.modified}
                    language={language}
                    modelKey={selected.path}
                    className="h-full"
                    editorClassName="h-full"
                    renderSideBySide={!isNarrow}
                    onLineSelection={threadId ? setSelection : undefined}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      renderOverviewRuler: true,
                      ignoreTrimWhitespace: false,
                      enableSplitViewResizing: true,
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
