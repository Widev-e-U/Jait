import { useCallback, useEffect, useMemo, useState } from 'react'
import Editor from '@monaco-editor/react'
import { Boxes, ExternalLink, Globe, Loader2, Save, X } from 'lucide-react'
import { ArchitecturePanel } from './architecture-panel'
import { ReadOnlyDiffView } from '@/components/diff/read-only-diff-view'
import { ReviewableEditor } from './reviewable-editor'
import { Button } from '@/components/ui/button'
import { getApiUrl } from '@/lib/gateway-url'
import { clearDetachedWorkspaceTab, loadDetachedWorkspaceTab, type DetachedWorkspaceTabPayload } from '@/lib/detached-workspace-tab'
import { ensureActiveMonacoTheme } from '@/lib/vscode-theme-store'
import { useConfiguredTheme } from '@/hooks/use-configured-theme'

function resolveDetachedPreviewSrc(src: string | null | undefined): string | null {
  const trimmed = src?.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (trimmed.startsWith('/')) return `${getApiUrl()}${trimmed}`
  return trimmed
}

async function saveWorkspaceFile(path: string, content: string, surfaceId?: string | null): Promise<void> {
  const res = await fetch(`${getApiUrl()}/api/workspace/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content, surfaceId }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(data.message || `Failed to save file: ${res.statusText}`)
  }
}

export function DetachedTabView({ detachedTabId }: { detachedTabId: string }) {
  const [payload, setPayload] = useState<DetachedWorkspaceTabPayload | null>(() => loadDetachedWorkspaceTab(detachedTabId))
  const [fileContent, setFileContent] = useState(payload?.tab.content ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const { monacoThemeName } = useConfiguredTheme(payload?.theme ?? 'dark')

  useEffect(() => {
    const sync = () => setPayload(loadDetachedWorkspaceTab(detachedTabId))
    sync()
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [detachedTabId])

  useEffect(() => {
    if (!payload) return
    document.title = payload.title || payload.tab.label || 'Jait'
  }, [payload])

  useEffect(() => {
    setFileContent(payload?.tab.content ?? '')
  }, [payload?.tab.content])

  const previewSrc = useMemo(() => resolveDetachedPreviewSrc(payload?.tab.previewSrc), [payload?.tab.previewSrc])

  const handleClose = useCallback(() => {
    clearDetachedWorkspaceTab(detachedTabId)
    window.close()
  }, [detachedTabId])

  const handleSave = useCallback(async () => {
    if (!payload || payload.tab.type !== 'file') return
    setIsSaving(true)
    setSaveError(null)
    try {
      await saveWorkspaceFile(payload.tab.path, fileContent, payload.surfaceId ?? null)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save file')
    } finally {
      setIsSaving(false)
    }
  }, [fileContent, payload])

  if (!payload) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Detached tab not found.
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-muted/10 text-foreground">
      <div className="flex h-[35px] items-center gap-2 border-b bg-muted/30 px-3 shrink-0">
        {payload.tab.type === 'architecture' ? (
          <Boxes className="h-4 w-4 shrink-0" />
        ) : payload.tab.type === 'preview' ? (
          <Globe className="h-4 w-4 shrink-0" />
        ) : null}
        <span className="truncate text-sm font-medium">{payload.title}</span>
        <div className="ml-auto flex items-center gap-1.5">
          {payload.tab.type === 'file' && (
            <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => { void handleSave() }} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Save className="mr-1 h-3 w-3" />}
              Save
            </Button>
          )}
          {payload.tab.type === 'preview' && previewSrc && (
            <a href={previewSrc} target="_blank" rel="noreferrer" className="inline-flex">
              <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs">
                <ExternalLink className="mr-1 h-3 w-3" />
                Open
              </Button>
            </a>
          )}
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {saveError ? (
        <div className="border-b px-3 py-2 text-xs text-destructive">{saveError}</div>
      ) : null}

      <div className="min-h-0 flex-1 bg-background">
        {payload.tab.type === 'diff' ? (
          <ReadOnlyDiffView
            className="h-full"
            editorClassName="h-full"
            original={payload.tab.originalContent ?? ''}
            modified={payload.tab.modifiedContent ?? ''}
            language={payload.tab.language ?? 'plaintext'}
            renderSideBySide
            options={{ minimap: { enabled: false } }}
          />
        ) : payload.tab.type === 'preview' ? (
          previewSrc ? (
            <iframe
              src={previewSrc}
              title={payload.title}
              className="h-full w-full bg-white"
              sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts allow-downloads"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Preview unavailable.</div>
          )
        ) : payload.tab.type === 'architecture' ? (
          <ArchitecturePanel
            diagram={payload.architectureDiagram ?? null}
            isGenerating={payload.architectureGenerating}
            theme={payload.theme}
          />
        ) : payload.tab.originalContent != null ? (
          <ReviewableEditor
            path={payload.tab.path}
            language={payload.tab.language ?? 'plaintext'}
            value={fileContent}
            originalContent={payload.tab.originalContent}
            theme={monacoThemeName}
            onChange={(value) => setFileContent(value ?? '')}
          />
        ) : (
          <Editor
            height="100%"
            beforeMount={ensureActiveMonacoTheme}
            theme={monacoThemeName}
            path={payload.tab.path}
            language={payload.tab.language ?? 'plaintext'}
            value={fileContent}
            onChange={(value) => setFileContent(value ?? '')}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              automaticLayout: true,
            }}
          />
        )}
      </div>
    </div>
  )
}
