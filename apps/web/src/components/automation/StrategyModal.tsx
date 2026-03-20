/**
 * StrategyModal — edit or generate a markdown strategy for a repository.
 *
 * The strategy acts like a CLAUDE.md or AGENTS.md file — it tells agent
 * threads how to work with the repo (build commands, test instructions,
 * coding conventions, etc.).
 */

import { useState, useEffect, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useConfirmDialog } from '@/components/ui/confirm-dialog'
import { Loader2, Sparkles, Save, RotateCcw } from 'lucide-react'
import { agentsApi } from '@/lib/agents-api'

// ── Props ────────────────────────────────────────────────────────────

interface StrategyModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  repoId: string
  repoName: string
}

// ── Component ────────────────────────────────────────────────────────

export function StrategyModal({ open, onOpenChange, repoId, repoName }: StrategyModalProps) {
  const confirm = useConfirmDialog()
  const [strategy, setStrategy] = useState('')
  const [savedStrategy, setSavedStrategy] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isDirty = strategy !== savedStrategy

  // Detect dark mode from the document
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  // ── Load strategy when modal opens ──────────────────────────────

  useEffect(() => {
    if (!open || !repoId) return
    let cancelled = false

    setLoading(true)
    setError(null)
    agentsApi.getRepoStrategy(repoId)
      .then((s) => {
        if (cancelled) return
        setStrategy(s)
        setSavedStrategy(s)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load strategy')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [open, repoId])

  // ── Save ────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      const saved = await agentsApi.updateRepoStrategy(repoId, strategy)
      setSavedStrategy(saved)
      setStrategy(saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save strategy')
    } finally {
      setSaving(false)
    }
  }, [repoId, strategy])

  // ── Generate via agent ──────────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    setError(null)
    try {
      const generated = await agentsApi.generateRepoStrategy(repoId)
      if (generated) {
        setStrategy(generated)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate strategy')
    } finally {
      setGenerating(false)
    }
  }, [repoId])

  // ── Reset to saved ──────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setStrategy(savedStrategy)
  }, [savedStrategy])

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen || !isDirty) {
      onOpenChange(nextOpen)
      return
    }

    void (async () => {
      const discard = await confirm({
        title: 'Discard changes',
        description: 'You have unsaved changes. Discard them?',
        confirmLabel: 'Discard',
        variant: 'destructive',
      })
      if (discard) onOpenChange(false)
    })()
  }, [confirm, isDirty, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <span>Strategy</span>
            <span className="text-muted-foreground">—</span>
            <span className="font-normal text-muted-foreground">{repoName}</span>
            {isDirty && (
              <span className="ml-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                unsaved
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          {loading ? (
            <div className="flex flex-1 items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="relative min-h-0 flex-1">
              <Editor
                height="55vh"
                language="markdown"
                theme={isDark ? 'vs-dark' : 'light'}
                value={strategy}
                onChange={(value) => setStrategy(value ?? '')}
                options={{
                  minimap: { enabled: false },
                  lineNumbers: 'off',
                  wordWrap: 'on',
                  fontSize: 13,
                  padding: { top: 12, bottom: 12 },
                  scrollBeyondLastLine: false,
                  renderLineHighlight: 'none',
                  overviewRulerLanes: 0,
                  folding: true,
                  tabSize: 2,
                }}
              />
              {!strategy.trim() && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center">
                  <div className="max-w-md space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      Add repository guidance for your agents
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground/80">
                      This works like a <code>CLAUDE.md</code> or <code>AGENTS.md</code> file:
                      describe build commands, test workflow, code conventions, and repo-specific rules.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="border-t bg-destructive/5 px-4 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t px-4 py-3">
          <div className="flex w-full items-center justify-between">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                disabled={generating || loading}
                onClick={handleGenerate}
              >
                {generating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Generate template
              </Button>
              {isDirty && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={handleReset}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="gap-1.5 text-xs"
                disabled={!isDirty || saving || loading}
                onClick={handleSave}
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
