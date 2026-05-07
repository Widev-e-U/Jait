import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { Check, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buildReviewHunks, computeMergedContent, getReviewAnchorLine, type ReviewHunk } from './review-hunks'
import { applyActiveMonacoTheme } from '@/lib/vscode-theme-store'

interface ReviewableEditorProps {
  path: string
  language: string
  value: string
  originalContent?: string | null
  searchHighlight?: { query: string; line?: number | null; key: number } | null
  theme: string
  readOnly?: boolean
  onChange?: (value: string | undefined) => void
  onApplyReview?: (resultContent: string) => void | Promise<void>
  onReferenceSelection?: (selection: string, startLine: number, endLine: number) => void
}

export function ReviewableEditor({
  path,
  language,
  value,
  originalContent,
  searchHighlight,
  theme,
  readOnly,
  onChange,
  onApplyReview,
  onReferenceSelection,
}: ReviewableEditorProps) {
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const lastSelectionKeyRef = useRef<string | null>(null)
  const reviewDecorationIdsRef = useRef<string[]>([])
  const searchDecorationIdsRef = useRef<string[]>([])
  const [hunks, setHunks] = useState<ReviewHunk[]>([])
  const [actionPositions, setActionPositions] = useState<Array<{ hunkIndex: number; top: number }>>([])
  const [isApplying, setIsApplying] = useState(false)
  const [editorReadyVersion, setEditorReadyVersion] = useState(0)

  const hasReview = Boolean(originalContent != null && originalContent !== value)

  useEffect(() => {
    if (!hasReview || originalContent == null) {
      setHunks([])
      return
    }
    setHunks(buildReviewHunks(originalContent, value))
  }, [hasReview, originalContent, value])

  const updateActionPositions = useCallback(() => {
    const editor = editorRef.current
    if (!editor || hunks.length === 0) {
      setActionPositions([])
      return
    }

    const scrollTop = editor.getScrollTop()
    const layout = editor.getLayoutInfo()
    const viewportHeight = layout.height
    const next = hunks.flatMap((hunk) => {
      if (hunk.state !== 'undecided') return []
      const lineNumber = getReviewAnchorLine(hunk)
      const top = editor.getTopForLineNumber(lineNumber) - scrollTop + 2
      if (!Number.isFinite(top) || top < -28 || top > viewportHeight) return []
      return [{ hunkIndex: hunk.index, top }]
    })
    setActionPositions(next)
  }, [hunks])

  const undecidedCount = useMemo(() => hunks.filter((hunk) => hunk.state === 'undecided').length, [hunks])
  const allDecided = hunks.length > 0 && undecidedCount === 0

  const applyMergedReview = useCallback(async () => {
    if (!allDecided || originalContent == null || !onApplyReview) return
    setIsApplying(true)
    try {
      const merged = computeMergedContent(originalContent.split('\n'), value.split('\n'), hunks)
      await onApplyReview(merged)
    } finally {
      setIsApplying(false)
    }
  }, [allDecided, hunks, onApplyReview, originalContent, value])

  useEffect(() => {
    if (!allDecided || !onApplyReview) return
    const timer = window.setTimeout(() => { void applyMergedReview() }, 600)
    return () => window.clearTimeout(timer)
  }, [allDecided, onApplyReview, applyMergedReview])

  useEffect(() => {
    updateActionPositions()
  }, [updateActionPositions])

  const setHunkState = useCallback((index: number, state: 'accepted' | 'rejected') => {
    setHunks((prev) => prev.map((hunk, hunkIndex) => (
      hunkIndex === index ? { ...hunk, state } : hunk
    )))
  }, [])

  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    const model = editor?.getModel?.()
    if (!editor || !monaco || !model) return

    const decorations = hasReview
      ? hunks
        .filter((hunk) => hunk.state === 'undecided')
        .flatMap((hunk) => {
          const modifiedLineCount = hunk.modifiedEndLineNumber > 0
            ? hunk.modifiedEndLineNumber - hunk.modifiedStartLineNumber + 1
            : 0
          const originalLineCount = hunk.originalEndLineNumber > 0
            ? hunk.originalEndLineNumber - hunk.originalStartLineNumber + 1
            : 0

          if (modifiedLineCount > 0) {
            const className = originalLineCount > 0 ? 'jait-editor-changed-line' : 'jait-editor-added-line'
            const gutterClassName = originalLineCount > 0 ? 'jait-editor-changed-gutter' : 'jait-editor-added-gutter'
            return [{
              range: new monaco.Range(
                hunk.modifiedStartLineNumber,
                1,
                hunk.modifiedEndLineNumber,
                model.getLineMaxColumn(hunk.modifiedEndLineNumber),
              ),
              options: {
                isWholeLine: true,
                className,
                linesDecorationsClassName: gutterClassName,
                overviewRuler: {
                  color: originalLineCount > 0 ? 'rgba(234, 179, 8, 0.8)' : 'rgba(34, 197, 94, 0.8)',
                  position: monaco.editor.OverviewRulerLane.Left,
                },
              },
            }]
          }

          const anchorLine = Math.min(Math.max(1, getReviewAnchorLine(hunk)), model.getLineCount())
          return [{
            range: new monaco.Range(anchorLine, 1, anchorLine, model.getLineMaxColumn(anchorLine)),
            options: {
              isWholeLine: true,
              className: 'jait-editor-removed-line',
              linesDecorationsClassName: 'jait-editor-removed-gutter',
              overviewRuler: {
                color: 'rgba(239, 68, 68, 0.8)',
                position: monaco.editor.OverviewRulerLane.Left,
              },
            },
          }]
        })
      : []

    reviewDecorationIdsRef.current = editor.deltaDecorations(reviewDecorationIdsRef.current, decorations)
  }, [editorReadyVersion, hasReview, hunks])

  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    const model = editor?.getModel?.()
    if (!editor || !monaco || !model) return

    const query = searchHighlight?.query.trim()
    if (!query) {
      searchDecorationIdsRef.current = editor.deltaDecorations(searchDecorationIdsRef.current, [])
      return
    }

    const lowerQuery = query.toLowerCase()
    const lineCount = model.getLineCount()
    const highlightedLine = searchHighlight?.line
    const requestedLine = highlightedLine && highlightedLine >= 1
      ? Math.min(highlightedLine, lineCount)
      : null
    const findInLine = (lineNumber: number) => {
      const content = model.getLineContent(lineNumber)
      const index = content.toLowerCase().indexOf(lowerQuery)
      return index >= 0 ? { lineNumber, index } : null
    }

    let match = requestedLine ? findInLine(requestedLine) : null
    if (!match) {
      for (let lineNumber = 1; lineNumber <= lineCount; lineNumber += 1) {
        match = findInLine(lineNumber)
        if (match) break
      }
    }

    if (!match) {
      searchDecorationIdsRef.current = editor.deltaDecorations(searchDecorationIdsRef.current, [])
      return
    }

    const range = new monaco.Range(
      match.lineNumber,
      match.index + 1,
      match.lineNumber,
      match.index + 1 + query.length,
    )
    searchDecorationIdsRef.current = editor.deltaDecorations(searchDecorationIdsRef.current, [
      {
        range: new monaco.Range(match.lineNumber, 1, match.lineNumber, model.getLineMaxColumn(match.lineNumber)),
        options: { isWholeLine: true, className: 'jait-editor-search-line' },
      },
      {
        range,
        options: {
          inlineClassName: 'jait-editor-search-hit',
          overviewRuler: {
            color: 'rgba(59, 130, 246, 0.85)',
            position: monaco.editor.OverviewRulerLane.Center,
          },
        },
      },
    ])
    editor.revealRangeInCenter(range, monaco.editor.ScrollType.Smooth)
    editor.setSelection(range)
  }, [editorReadyVersion, searchHighlight, value])

  useEffect(() => {
    const monaco = monacoRef.current
    if (!monaco) return
    applyActiveMonacoTheme(monaco, theme)
  }, [theme])

  const emitSelectionReference = useCallback(() => {
    const editor = editorRef.current
    const model = editor?.getModel?.()
    const selection = editor?.getSelection?.()
    if (!editor || !model || !selection || selection.isEmpty()) {
      lastSelectionKeyRef.current = null
      return
    }
    const text = model.getValueInRange(selection).trim()
    if (!text) {
      lastSelectionKeyRef.current = null
      return
    }
    const selectionKey = `${selection.startLineNumber}:${selection.endLineNumber}:${text}`
    if (lastSelectionKeyRef.current === selectionKey) return
    lastSelectionKeyRef.current = selectionKey
    onReferenceSelection?.(text, selection.startLineNumber, selection.endLineNumber)
  }, [onReferenceSelection])

  return (
    <div className="relative h-full">
      <Editor
        key={path}
        height="100%"
        beforeMount={(monaco) => applyActiveMonacoTheme(monaco, theme)}
        theme={theme}
        path={path}
        language={language}
        value={value}
        onChange={onChange}
        onMount={(editor, monaco) => {
          editorRef.current = editor
          monacoRef.current = monaco
          setEditorReadyVersion((version) => version + 1)
          applyActiveMonacoTheme(monaco, theme)
          const disposables = [
            editor.onDidScrollChange(() => updateActionPositions()),
            editor.onDidLayoutChange(() => updateActionPositions()),
            editor.onDidContentSizeChange(() => updateActionPositions()),
            editor.onMouseUp(() => window.setTimeout(emitSelectionReference, 0)),
            editor.onKeyUp(() => window.setTimeout(emitSelectionReference, 0)),
          ]
          window.setTimeout(updateActionPositions, 0)
          ;(editor as any).__jaitReviewDisposables = disposables
        }}
        options={{
          readOnly,
          minimap: { enabled: false },
          'semanticHighlighting.enabled': true,
          fontSize: 13,
          automaticLayout: true,
        }}
      />

      {actionPositions.length > 0 && !readOnly && (
        <div className="pointer-events-none absolute inset-0 z-20">
          {actionPositions.map(({ hunkIndex, top }) => {
            const hunk = hunks[hunkIndex]
            if (!hunk || hunk.state !== 'undecided') return null
            return (
              <div
                key={`review-${hunkIndex}`}
                className="pointer-events-auto absolute right-3 flex items-center gap-1 rounded-md border bg-background/95 p-1 shadow-md backdrop-blur-sm"
                style={{ top }}
              >
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-green-600 hover:bg-green-500/10 hover:text-green-500"
                  onClick={() => setHunkState(hunkIndex, 'accepted')}
                >
                  <Check className="mr-1 h-3 w-3" />
                  Keep
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-500"
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

      {hasReview && !readOnly && (
        <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-background/95 px-3 py-1.5 text-xs shadow-md backdrop-blur-sm">
          <span className="font-medium">{undecidedCount} pending</span>
          {allDecided && <span className="text-muted-foreground">{isApplying ? 'Applying...' : 'Applying review...'}</span>}
        </div>
      )}
    </div>
  )
}
