import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import loader from '@monaco-editor/loader'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useEditorThemeName } from '@/hooks/use-editor-theme'
import { ensureActiveMonacoTheme } from '@/lib/vscode-theme-store'
import { cn } from '@/lib/utils'

interface ReadOnlyDiffViewProps {
  original: string
  modified: string
  language: string
  modelKey?: string
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
  modelKey,
  className,
  editorClassName,
  renderSideBySide = false,
  emptyMessage = 'Files are identical.',
  options,
}: ReadOnlyDiffViewProps) {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const containerRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const diffUpdateDisposableRef = useRef<{ dispose: () => void } | null>(null)
  const explicitModelsRef = useRef<{ original: any | null; modified: any | null }>({ original: null, modified: null })
  const [isReady, setIsReady] = useState(false)
  const [changes, setChanges] = useState<DiffChange[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const monacoThemeName = useEditorThemeName()

  const modelPathBase = useMemo(
    () => `inmemory://jait-diff/${encodeURIComponent(modelKey ?? `${language}:${original.length}:${modified.length}`)}`,
    [language, modelKey, modified.length, original.length],
  )

  const mergedOptions = useMemo(() => ({
    readOnly: true,
    renderSideBySide,
    minimap: { enabled: false },
    fontSize: 13,
    automaticLayout: true,
    scrollBeyondLastLine: false,
    renderOverviewRuler: true,
    ignoreTrimWhitespace: false,
    ...options,
  }), [options, renderSideBySide])

  const syncChanges = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const lineChanges = editor.getLineChanges?.() ?? []
    setChanges(lineChanges.map((change: DiffChange) => ({
      originalStartLineNumber: change.originalStartLineNumber,
      originalEndLineNumber: change.originalEndLineNumber,
      modifiedStartLineNumber: change.modifiedStartLineNumber,
      modifiedEndLineNumber: change.modifiedEndLineNumber,
    })))
  }, [])

  useEffect(() => {
    let cancelled = false
    const init = loader.init()

    void init.then((monaco) => {
      if (cancelled || !containerRef.current) return
      monacoRef.current = monaco
      ensureActiveMonacoTheme(monaco)
      const editor = monaco.editor.createDiffEditor(containerRef.current, {
        automaticLayout: true,
        ...mergedOptions,
      })
      editorRef.current = editor
      diffUpdateDisposableRef.current = editor.onDidUpdateDiff(() => syncChanges())
      monaco.editor.setTheme(monacoThemeName)
      setIsReady(true)
      syncChanges()
    }).catch((error) => {
      if (!cancelled && error?.type !== 'cancelation') {
        console.error('Monaco initialization: error:', error)
      }
    })

    return () => {
      cancelled = true
      diffUpdateDisposableRef.current?.dispose()
      diffUpdateDisposableRef.current = null

      const editor = editorRef.current
      const models = explicitModelsRef.current
      try {
        editor?.setModel(null)
      } catch {
        // Ignore teardown races during unmount.
      }
      editor?.dispose?.()
      models.original?.dispose?.()
      models.modified?.dispose?.()
      explicitModelsRef.current = { original: null, modified: null }
      editorRef.current = null
      monacoRef.current = null
      setIsReady(false)
      init.cancel()
    }
  }, [syncChanges])

  useEffect(() => {
    setActiveIndex(0)
  }, [original, modified, language])

  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!isReady || !editor || !monaco) return

    const previous = explicitModelsRef.current
    const originalUri = monaco.Uri.parse(`${modelPathBase}.original`)
    const modifiedUri = monaco.Uri.parse(`${modelPathBase}.modified`)
    monaco.editor.getModel(originalUri)?.dispose()
    monaco.editor.getModel(modifiedUri)?.dispose()
    const originalModel = monaco.editor.createModel(original, language, originalUri)
    const modifiedModel = monaco.editor.createModel(modified, language, modifiedUri)

    editor.setModel({ original: originalModel, modified: modifiedModel })
    explicitModelsRef.current = { original: originalModel, modified: modifiedModel }
    syncChanges()

    return () => {
      try {
        editor.setModel(null)
      } catch {
        // Ignore teardown races during model swaps.
      }
      previous.original?.dispose?.()
      previous.modified?.dispose?.()
      originalModel.dispose()
      modifiedModel.dispose()
      if (explicitModelsRef.current.original === originalModel || explicitModelsRef.current.modified === modifiedModel) {
        explicitModelsRef.current = { original: null, modified: null }
      }
    }
  }, [isReady, language, modelPathBase, modified, original, syncChanges])

  useEffect(() => {
    const monaco = monacoRef.current
    if (!monaco) return
    ensureActiveMonacoTheme(monaco)
    monaco.editor.setTheme(monacoThemeName)
  }, [monacoThemeName])

  useEffect(() => {
    editorRef.current?.updateOptions?.(mergedOptions)
  }, [mergedOptions])

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

    const nextDecorations: Array<{ editor: any; range: any }> = []
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

  return (
    <div className={cn('relative min-h-0', className)}>
      <div className={cn('h-full min-h-0', editorClassName)}>
        <div ref={containerRef} className="h-full min-h-0" />
      </div>

      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Loading diff...
        </div>
      )}

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

      {changes.length === 0 && original === modified && isReady && (
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
