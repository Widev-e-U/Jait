import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DiffEditor } from '@monaco-editor/react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useResolvedTheme } from '@/hooks/use-resolved-theme'
import { cn } from '@/lib/utils'

interface ReadOnlyDiffViewProps {
  original: string
  modified: string
  language: string
  className?: string
  editorClassName?: string
  renderSideBySide?: boolean
  emptyMessage?: string
  options?: any
}

interface DiffChange {
  originalStartLineNumber: number
  originalEndLineNumber: number
  modifiedStartLineNumber: number
  modifiedEndLineNumber: number
}

function resolveLineNumber(start: number, end: number) {
  return Math.max(1, start || end || 1)
}

export function ReadOnlyDiffView({
  original,
  modified,
  language,
  className,
  editorClassName,
  renderSideBySide = false,
  emptyMessage = 'Files are identical.',
  options,
}: ReadOnlyDiffViewProps) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const [changes, setChanges] = useState<DiffChange[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const theme = useResolvedTheme()

  useEffect(() => {
    setActiveIndex(0)
  }, [original, modified, language])

  const syncChanges = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const lineChanges = editor.getLineChanges() ?? []
    setChanges(lineChanges.map((change: DiffChange) => ({
      originalStartLineNumber: change.originalStartLineNumber,
      originalEndLineNumber: change.originalEndLineNumber,
      modifiedStartLineNumber: change.modifiedStartLineNumber,
      modifiedEndLineNumber: change.modifiedEndLineNumber,
    })))
  }, [])

  const handleMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor
    monacoRef.current = monaco
    editor.onDidUpdateDiff(() => syncChanges())
    syncChanges()
  }, [syncChanges])

  useEffect(() => {
    if (changes.length === 0) return
    setActiveIndex((prev) => Math.min(prev, changes.length - 1))
  }, [changes])

  useEffect(() => {
    const editor = editorRef.current
    if (!editor || changes.length === 0) return
    const change = changes[activeIndex]
    if (!change) return
    const modifiedEditor = editor.getModifiedEditor()
    const originalEditor = editor.getOriginalEditor()
    try {
      if (change.modifiedStartLineNumber > 0 || change.modifiedEndLineNumber > 0) {
        modifiedEditor.revealLineInCenter(resolveLineNumber(change.modifiedStartLineNumber, change.modifiedEndLineNumber))
      } else {
        originalEditor.revealLineInCenter(resolveLineNumber(change.originalStartLineNumber, change.originalEndLineNumber))
      }
    } catch {
      // Monaco may not be ready during diff recomputation.
    }
  }, [activeIndex, changes])

  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco || changes.length === 0) return
    const change = changes[activeIndex]
    if (!change) return

    const nextDecorations = []
    if (change.originalStartLineNumber > 0 || change.originalEndLineNumber > 0) {
      nextDecorations.push({
        editor: editor.getOriginalEditor(),
        range: new monaco.Range(
          resolveLineNumber(change.originalStartLineNumber, change.originalEndLineNumber),
          1,
          resolveLineNumber(change.originalEndLineNumber, change.originalStartLineNumber),
          1,
        ),
      })
    }
    if (change.modifiedStartLineNumber > 0 || change.modifiedEndLineNumber > 0) {
      nextDecorations.push({
        editor: editor.getModifiedEditor(),
        range: new monaco.Range(
          resolveLineNumber(change.modifiedStartLineNumber, change.modifiedEndLineNumber),
          1,
          resolveLineNumber(change.modifiedEndLineNumber, change.modifiedStartLineNumber),
          1,
        ),
      })
    }

    const decorationIds = nextDecorations.map(({ editor: sideEditor, range }) => sideEditor.deltaDecorations([], [{
      range,
      options: {
        isWholeLine: true,
        className: 'diff-change-active',
      },
    }]))

    return () => {
      for (let i = 0; i < nextDecorations.length; i++) {
        try {
          nextDecorations[i]?.editor.deltaDecorations(decorationIds[i] ?? [], [])
        } catch {
          // Editor may have unmounted.
        }
      }
    }
  }, [activeIndex, changes])

  const goPrev = useCallback(() => {
    setActiveIndex((prev) => Math.max(prev - 1, 0))
  }, [])

  const goNext = useCallback(() => {
    setActiveIndex((prev) => Math.min(prev + 1, changes.length - 1))
  }, [changes.length])

  const mergedOptions = useMemo(() => ({
    readOnly: true,
    renderSideBySide,
    minimap: { enabled: false },
    fontSize: 13,
    automaticLayout: true,
    scrollBeyondLastLine: false,
    renderOverviewRuler: true,
    ignoreTrimWhitespace: false,
    ...(options ?? {}),
  }), [options, renderSideBySide])

  return (
    <div className={cn('relative min-h-0', className)}>
      <div className={cn('h-full min-h-0', editorClassName)}>
        <DiffEditor
          original={original}
          modified={modified}
          language={language}
          theme={theme === 'dark' ? 'vs-dark' : 'vs'}
          onMount={handleMount}
          options={mergedOptions}
        />
      </div>

      {changes.length > 1 && (
        <div className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 flex-col gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            className="h-9 w-9 rounded-full border bg-background/90 p-0 shadow-lg backdrop-blur-sm hover:bg-background"
            onClick={goPrev}
            disabled={activeIndex === 0}
            title="Previous change"
          >
            <ChevronUp className="h-5 w-5" />
          </Button>
          <span className="text-center font-medium tabular-nums text-[10px] text-muted-foreground">
            {activeIndex + 1}/{changes.length}
          </span>
          <Button
            size="sm"
            variant="secondary"
            className="h-9 w-9 rounded-full border bg-background/90 p-0 shadow-lg backdrop-blur-sm hover:bg-background"
            onClick={goNext}
            disabled={activeIndex === changes.length - 1}
            title="Next change"
          >
            <ChevronDown className="h-5 w-5" />
          </Button>
        </div>
      )}

      {changes.length === 0 && original === modified && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-md border bg-background/90 px-3 py-2 text-center text-xs text-muted-foreground shadow-sm">
          {emptyMessage}
        </div>
      )}

      <style>{`
        .diff-change-active { outline: 1px solid rgba(99, 102, 241, 0.5); outline-offset: -1px; }
      `}</style>
    </div>
  )
}
