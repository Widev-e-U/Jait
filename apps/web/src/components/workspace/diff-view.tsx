import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import { Check, ChevronLeft, ChevronRight, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DiffHunk {
  /** Index in the hunks array */
  index: number
  /** 1-based inclusive. 0 = pure insertion (nothing removed from original) */
  originalStartLineNumber: number
  originalEndLineNumber: number
  /** 1-based inclusive. 0 = pure deletion (nothing added in modified) */
  modifiedStartLineNumber: number
  modifiedEndLineNumber: number
  /** User decision for this hunk */
  state: 'undecided' | 'accepted' | 'rejected'
}

export interface DiffViewProps {
  filePath: string
  originalContent: string
  modifiedContent: string
  language: string
  onClose: () => void
  /**
   * Called when the user applies all decisions.
   * `resultContent` is the merged file content after
   * selectively keeping / reverting each hunk.
   */
  onApply: (resultContent: string) => void
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/**
 * Compute the final file content by selectively applying accepted hunks
 * while reverting rejected hunks to the original.
 *
 * Hunks are processed from last-to-first so that earlier line numbers
 * remain valid after each splice.
 */
function computeMergedContent(
  originalLines: string[],
  modifiedLines: string[],
  hunks: DiffHunk[],
): string {
  // Start from the original content
  const result = [...originalLines]

  // Process hunks from bottom to top
  for (let i = hunks.length - 1; i >= 0; i--) {
    const h = hunks[i]
    if (h.state === 'rejected') continue // keep original — nothing to do

    // Determine new lines (from modified) for this hunk
    let newLines: string[]
    if (h.modifiedEndLineNumber === 0) {
      // Pure deletion — accepted means delete these lines
      newLines = []
    } else {
      newLines = modifiedLines.slice(
        h.modifiedStartLineNumber - 1,
        h.modifiedEndLineNumber,
      )
    }

    // Determine splice position and count in the original
    if (h.originalEndLineNumber === 0) {
      // Pure insertion — insert after originalStartLineNumber
      result.splice(h.originalStartLineNumber, 0, ...newLines)
    } else {
      const start = h.originalStartLineNumber - 1
      const count = h.originalEndLineNumber - h.originalStartLineNumber + 1
      result.splice(start, count, ...newLines)
    }
  }

  return result.join('\n')
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DiffView({
  filePath,
  originalContent,
  modifiedContent,
  language,
  onClose,
  onApply,
}: DiffViewProps) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)

  const [hunks, setHunks] = useState<DiffHunk[]>([])
  const [activeIndex, setActiveIndex] = useState(0)

  const fileName = filePath.split(/[/\\]/).pop() ?? filePath

  /* ---- Monaco mount ---- */
  const handleMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor
    monacoRef.current = monaco

    const extractChanges = () => {
      const lineChanges = editor.getLineChanges()
      if (!lineChanges || lineChanges.length === 0) return
      setHunks(
        lineChanges.map((c: any, i: number) => ({
          index: i,
          originalStartLineNumber: c.originalStartLineNumber,
          originalEndLineNumber: c.originalEndLineNumber,
          modifiedStartLineNumber: c.modifiedStartLineNumber,
          modifiedEndLineNumber: c.modifiedEndLineNumber,
          state: 'undecided' as const,
        })),
      )
    }

    // The diff is computed asynchronously
    editor.onDidUpdateDiff(() => extractChanges())
    // Also try immediately in case it's already done
    extractChanges()
  }, [])

  /* ---- Scroll to active hunk ---- */
  useEffect(() => {
    if (!editorRef.current || hunks.length === 0) return
    const h = hunks[activeIndex]
    if (!h) return
    const line = h.modifiedEndLineNumber > 0
      ? h.modifiedStartLineNumber
      : h.originalStartLineNumber
    try {
      editorRef.current.getModifiedEditor().revealLineInCenter(line)
    } catch { /* editor may not be ready */ }
  }, [activeIndex, hunks])

  /* ---- Hunk decorations ---- */
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || hunks.length === 0) return
    const monaco = monacoRef.current
    const modEditor = editorRef.current.getModifiedEditor()

    // Build decorations for resolved hunks
    const decorations: any[] = []
    for (const h of hunks) {
      if (h.state === 'undecided') continue
      const startLine = h.modifiedEndLineNumber > 0 ? h.modifiedStartLineNumber : h.originalStartLineNumber
      const endLine = h.modifiedEndLineNumber > 0 ? h.modifiedEndLineNumber : h.originalStartLineNumber
      decorations.push({
        range: new monaco.Range(startLine, 1, endLine, 1),
        options: {
          isWholeLine: true,
          className: h.state === 'accepted' ? 'diff-hunk-accepted' : 'diff-hunk-rejected',
          overviewRuler: {
            color: h.state === 'accepted' ? '#22c55e44' : '#ef444444',
            position: monaco.editor.OverviewRulerLane.Full,
          },
        },
      })
    }

    const ids = modEditor.deltaDecorations([], decorations)
    return () => {
      try { modEditor.deltaDecorations(ids, []) } catch { /* unmounted */ }
    }
  }, [hunks])

  /* ---- Highlight active hunk ---- */
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || hunks.length === 0) return
    const monaco = monacoRef.current
    const modEditor = editorRef.current.getModifiedEditor()
    const h = hunks[activeIndex]
    if (!h) return

    const startLine = h.modifiedEndLineNumber > 0 ? h.modifiedStartLineNumber : h.originalStartLineNumber
    const endLine = h.modifiedEndLineNumber > 0 ? h.modifiedEndLineNumber : h.originalStartLineNumber

    const ids = modEditor.deltaDecorations([], [{
      range: new monaco.Range(startLine, 1, endLine, 1),
      options: {
        isWholeLine: true,
        className: 'diff-hunk-active',
      },
    }])
    return () => {
      try { modEditor.deltaDecorations(ids, []) } catch { /* unmounted */ }
    }
  }, [activeIndex, hunks])

  /* ---- Actions ---- */
  const setHunkState = useCallback((index: number, state: 'accepted' | 'rejected') => {
    setHunks(prev => {
      const updated = prev.map((h, i) => (i === index ? { ...h, state } : h))
      // Auto-advance to next undecided hunk
      const next = updated.findIndex((h, i) => i > index && h.state === 'undecided')
      if (next >= 0) setActiveIndex(next)
      return updated
    })
  }, [])

  const acceptHunk = useCallback(() => setHunkState(activeIndex, 'accepted'), [activeIndex, setHunkState])
  const rejectHunk = useCallback(() => setHunkState(activeIndex, 'rejected'), [activeIndex, setHunkState])

  const acceptAll = useCallback(() => {
    setHunks(prev => prev.map(h => ({ ...h, state: 'accepted' as const })))
  }, [])

  const rejectAll = useCallback(() => {
    setHunks(prev => prev.map(h => ({ ...h, state: 'rejected' as const })))
  }, [])

  const goNext = useCallback(() => {
    setActiveIndex(prev => Math.min(prev + 1, hunks.length - 1))
  }, [hunks.length])

  const goPrev = useCallback(() => {
    setActiveIndex(prev => Math.max(prev - 1, 0))
  }, [])

  /* ---- Derived state ---- */
  const undecidedCount = useMemo(() => hunks.filter(h => h.state === 'undecided').length, [hunks])
  const allDecided = hunks.length > 0 && undecidedCount === 0
  const activeHunk = hunks[activeIndex]

  /* ---- Apply ---- */
  const handleApply = useCallback(() => {
    const origLines = originalContent.split('\n')
    const modLines = modifiedContent.split('\n')
    const merged = computeMergedContent(origLines, modLines, hunks)
    onApply(merged)
  }, [originalContent, modifiedContent, hunks, onApply])

  // Auto-apply when all hunks are decided
  useEffect(() => {
    if (!allDecided) return
    const timer = setTimeout(handleApply, 600)
    return () => clearTimeout(timer)
  }, [allDecided, handleApply])


  return (
    <div className="flex flex-col h-full bg-background">
      {/* Top toolbar */}
      <div className="flex items-center justify-between h-10 px-3 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium truncate" title={filePath}>
            {fileName}
          </span>
          {hunks.length > 0 && (
            <span className="text-[10px] text-muted-foreground shrink-0">
              {hunks.length} change{hunks.length !== 1 ? 's' : ''}
              {undecidedCount > 0 && (
                <span className="text-amber-500 ml-1">{undecidedCount} pending</span>
              )}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            onClick={acceptAll}
            disabled={undecidedCount === 0}
          >
            <Check className="h-3 w-3 mr-1" />
            Accept all
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px]"
            onClick={rejectAll}
            disabled={undecidedCount === 0}
          >
            <Undo2 className="h-3 w-3 mr-1" />
            Reject all
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Monaco DiffEditor — inline mode */}
      <div className="flex-1 min-h-0">
        <DiffEditor
          original={originalContent}
          modified={modifiedContent}
          language={language}
          theme="vs-dark"
          onMount={handleMount}
          options={{
            readOnly: true,
            renderSideBySide: false,
            minimap: { enabled: false },
            fontSize: 13,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            renderOverviewRuler: true,
            ignoreTrimWhitespace: false,
          }}
        />
      </div>

      {/* Bottom hunk navigation bar */}
      {hunks.length > 0 && (
        <div className="flex items-center justify-between h-9 px-3 border-t bg-muted/20 shrink-0">
          {/* Hunk counter & navigation */}
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={goPrev}
              disabled={activeIndex === 0}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-[11px] text-muted-foreground min-w-[60px] text-center">
              Change {activeIndex + 1} of {hunks.length}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={goNext}
              disabled={activeIndex === hunks.length - 1}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Status & per-hunk actions */}
          <div className="flex items-center gap-2">
            {activeHunk && activeHunk.state !== 'undecided' && (
              <span className={cn(
                'text-[10px] font-medium',
                activeHunk.state === 'accepted' ? 'text-green-500' : 'text-red-500',
              )}>
                {activeHunk.state === 'accepted' ? 'Kept' : 'Reverted'}
              </span>
            )}
            {activeHunk && activeHunk.state === 'undecided' && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px] text-green-600 hover:text-green-500 hover:bg-green-500/10"
                  onClick={acceptHunk}
                >
                  <Check className="h-3 w-3 mr-1" />
                  Keep
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px] text-red-600 hover:text-red-500 hover:bg-red-500/10"
                  onClick={rejectHunk}
                >
                  <Undo2 className="h-3 w-3 mr-1" />
                  Undo
                </Button>
              </>
            )}
          </div>

          {/* Apply button — shows when all decided */}
          {allDecided && (
            <Button
              size="sm"
              variant="default"
              className="h-6 px-3 text-[11px]"
              onClick={handleApply}
            >
              Apply
            </Button>
          )}
        </div>
      )}

      {/* Empty state — no changes detected (e.g. identical files) */}
      {hunks.length === 0 && originalContent === modifiedContent && (
        <div className="flex items-center justify-center h-9 px-3 border-t bg-muted/20 text-xs text-muted-foreground">
          Files are identical — no changes to review.
        </div>
      )}

      {/* Style overrides for hunk decorations */}
      <style>{`
        .diff-hunk-accepted { opacity: 0.55; }
        .diff-hunk-rejected { opacity: 0.3; text-decoration: line-through; }
        .diff-hunk-active { outline: 1px solid rgba(99, 102, 241, 0.5); outline-offset: -1px; }
      `}</style>
    </div>
  )
}
