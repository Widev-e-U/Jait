import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useResolvedTheme } from '@/hooks/use-resolved-theme'
import { cn } from '@/lib/utils'
import { buildReviewHunks, computeMergedContent, getReviewAnchorLine, type ReviewHunk } from './review-hunks'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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
  const [actionPositions, setActionPositions] = useState<Array<{ hunkIndex: number; top: number }>>([])

  const [hunks, setHunks] = useState<ReviewHunk[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  const theme = useResolvedTheme()

  const fileName = filePath.split(/[/\\]/).pop() ?? filePath

  useEffect(() => {
    const update = () => setIsNarrow(window.innerWidth < 768)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    setHunks((prev) => {
      const next = buildReviewHunks(originalContent, modifiedContent)
      if (prev.length === next.length) {
        return next.map((hunk, index) => ({ ...hunk, state: prev[index]?.state ?? 'undecided' }))
      }
      return next
    })
    setActiveIndex(0)
  }, [originalContent, modifiedContent])

  const updateActionPositions = useCallback(() => {
    const editor = editorRef.current?.getModifiedEditor?.()
    if (!editor || hunks.length === 0) {
      setActionPositions([])
      return
    }

    const scrollTop = editor.getScrollTop()
    const layout = editor.getLayoutInfo()
    const viewportHeight = editor.getScrollHeight() > 0 ? editor.getScrollHeight() : layout.height
    const next = hunks.flatMap((hunk) => {
      if (hunk.state !== 'undecided') return []
      const lineNumber = getReviewAnchorLine(hunk)
      const top = editor.getTopForLineNumber(lineNumber) - scrollTop + 2
      if (!Number.isFinite(top) || top < -28 || top > viewportHeight) return []
      return [{ hunkIndex: hunk.index, top }]
    })
    setActionPositions(next)
  }, [hunks])

  /* ---- Monaco mount ---- */
  const disposablesRef = useRef<any[]>([])
  const handleMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor
    monacoRef.current = monaco
    const modEditor = editor.getModifiedEditor()
    disposablesRef.current = [
      modEditor.onDidScrollChange(() => updateActionPositions()),
      modEditor.onDidLayoutChange(() => updateActionPositions()),
      modEditor.onDidContentSizeChange(() => updateActionPositions()),
      editor.onDidUpdateDiff(() => updateActionPositions()),
    ]
    window.setTimeout(updateActionPositions, 0)
  }, [updateActionPositions])

  /* Dispose listeners and models before the DiffEditor unmounts */
  useEffect(() => {
    return () => {
      for (const d of disposablesRef.current) d.dispose()
      disposablesRef.current = []
      const editor = editorRef.current
      if (editor) {
        try {
          const model = editor.getModel()
          editor.dispose()
          model?.original?.dispose()
          model?.modified?.dispose()
        } catch { /* already disposed */ }
      }
      editorRef.current = null
      monacoRef.current = null
    }
  }, [])

  /* ---- Scroll to active hunk ---- */
  useEffect(() => {
    if (!editorRef.current || hunks.length === 0) return
    const h = hunks[activeIndex]
    if (!h) return
    const line = getReviewAnchorLine(h)
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

  useEffect(() => {
    updateActionPositions()
  }, [updateActionPositions, activeIndex, hunks])

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

  const goNextUndecided = useCallback(() => {
    const next = hunks.findIndex((h, i) => i > activeIndex && h.state === 'undecided')
    if (next >= 0) { setActiveIndex(next); return }
    // Wrap around from beginning
    const wrap = hunks.findIndex(h => h.state === 'undecided')
    if (wrap >= 0) setActiveIndex(wrap)
  }, [hunks, activeIndex])

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
      <div className="flex flex-col gap-2 px-3 py-2 border-b bg-muted/30 shrink-0 sm:flex-row sm:items-center sm:justify-between">
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

        <div className="flex flex-wrap items-center gap-1 shrink-0">
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

      {/* Monaco DiffEditor — inline mode with floating nav */}
      <div className="flex-1 min-h-0 relative">
        <DiffEditor
          original={originalContent}
          modified={modifiedContent}
          language={language}
          theme={theme === 'dark' ? 'vs-dark' : 'vs'}
          keepCurrentOriginalModel
          keepCurrentModifiedModel
          onMount={handleMount}
          options={{
            readOnly: true,
            renderSideBySide: false,
            minimap: { enabled: false },
            fontSize: 13,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            renderOverviewRuler: !isNarrow,
            ignoreTrimWhitespace: false,
          }}
        />
        {actionPositions.length > 0 && (
          <div className="pointer-events-none absolute inset-0 z-20">
            {actionPositions.map(({ hunkIndex, top }) => {
              const hunk = hunks[hunkIndex]
              if (!hunk || hunk.state !== 'undecided') return null
              return (
                <div
                  key={`actions-${hunkIndex}`}
                  className="pointer-events-auto absolute right-3 flex items-center gap-1 rounded-md border bg-background/95 p-1 shadow-md backdrop-blur-sm"
                  style={{ top }}
                >
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px] text-green-600 hover:bg-green-500/10 hover:text-green-500"
                    onClick={() => setHunkState(hunkIndex, 'accepted')}
                  >
                    <Check className="mr-1 h-3 w-3" />
                    Keep
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px] text-red-600 hover:bg-red-500/10 hover:text-red-500"
                    onClick={() => setHunkState(hunkIndex, 'rejected')}
                  >
                    <Undo2 className="mr-1 h-3 w-3" />
                    Undo
                  </Button>
                </div>
              )
            })}
          </div>
        )}

        {/* Floating navigation buttons overlaying the editor */}
        {hunks.length > 1 && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 z-10">
            <Button
              size="sm"
              variant="secondary"
              className="h-9 w-9 p-0 rounded-full shadow-lg border bg-background/90 backdrop-blur-sm hover:bg-background"
              onClick={goPrev}
              disabled={activeIndex === 0}
              title="Previous change"
            >
              <ChevronUp className="h-5 w-5" />
            </Button>
            <span className="text-[10px] text-center text-muted-foreground font-medium tabular-nums">
              {activeIndex + 1}/{hunks.length}
            </span>
            <Button
              size="sm"
              variant="secondary"
              className="h-9 w-9 p-0 rounded-full shadow-lg border bg-background/90 backdrop-blur-sm hover:bg-background"
              onClick={goNext}
              disabled={activeIndex === hunks.length - 1}
              title="Next change"
            >
              <ChevronDown className="h-5 w-5" />
            </Button>
          </div>
        )}
      </div>

      {/* Bottom hunk navigation bar */}
      {hunks.length > 0 && (
        <div className="flex flex-col gap-2 px-3 py-2 border-t bg-muted/20 shrink-0 md:flex-row md:items-center md:justify-between">
          {/* Hunk counter & navigation */}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={goPrev}
              disabled={activeIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground min-w-[70px] text-center tabular-nums">
              Change {activeIndex + 1} of {hunks.length}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={goNext}
              disabled={activeIndex === hunks.length - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            {undecidedCount > 0 && undecidedCount < hunks.length && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px] text-amber-500 border-amber-500/30 hover:bg-amber-500/10 ml-1"
                onClick={goNextUndecided}
              >
                Next pending
              </Button>
            )}
          </div>

          {/* Status & per-hunk actions */}
          <div className="flex flex-wrap items-center gap-2">
            {activeHunk && activeHunk.state !== 'undecided' && (
              <span className={cn(
                'text-xs font-medium',
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
                  className="h-8 px-3 text-xs text-green-600 hover:text-green-500 hover:bg-green-500/10"
                  onClick={acceptHunk}
                >
                  <Check className="h-3.5 w-3.5 mr-1" />
                  Keep
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-3 text-xs text-red-600 hover:text-red-500 hover:bg-red-500/10"
                  onClick={rejectHunk}
                >
                  <Undo2 className="h-3.5 w-3.5 mr-1" />
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
              className="h-8 px-4 text-xs"
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
