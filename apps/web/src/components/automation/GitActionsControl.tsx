/**
 * GitActionsControl — Commit / Push / Create PR flow.
 *
 * Adapted from the t3code GitActionsControl but using HTTP API
 * instead of Electron IPC. Shows the quick-action button + drop-down
 * menu for git operations on a registered repository.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ChevronDown,
  GitCommit,
  CloudUpload,
  Github,
  Loader2,
  ArrowDownToLine,
  Eye,
  X,
} from 'lucide-react'
import {
  gitApi,
  buildMenuItems,
  resolveQuickAction,
  summarizeGitResult,
  type GitStatusResult,
  type GitStackedAction,
  type GitActionMenuItem,
  type GitQuickAction,
  type GitDiffResult,
} from '@/lib/git-api'
import { toast } from 'sonner'

interface GitActionsControlProps {
  /** Absolute path to the git repo working directory */
  cwd: string
  /** Poll interval for status refresh (ms, 0 = manual only) */
  pollInterval?: number
}

// ── Sub-components ───────────────────────────────────────────────────

function ActionIcon({ icon }: { icon: 'commit' | 'push' | 'pr' }) {
  if (icon === 'commit') return <GitCommit className="h-3.5 w-3.5" />
  if (icon === 'push') return <CloudUpload className="h-3.5 w-3.5" />
  return <Github className="h-3.5 w-3.5" />
}

function QuickActionIcon({ quickAction }: { quickAction: GitQuickAction }) {
  if (quickAction.kind === 'open_pr') return <Github className="h-3.5 w-3.5" />
  if (quickAction.kind === 'run_pull') return <ArrowDownToLine className="h-3.5 w-3.5" />
  if (quickAction.kind === 'run_action') {
    if (quickAction.action === 'commit') return <GitCommit className="h-3.5 w-3.5" />
    if (quickAction.action === 'commit_push') return <CloudUpload className="h-3.5 w-3.5" />
    return <Github className="h-3.5 w-3.5" />
  }
  return <GitCommit className="h-3.5 w-3.5" />
}

// ── Main component ───────────────────────────────────────────────────

export function GitActionsControl({ cwd, pollInterval = 15_000 }: GitActionsControlProps) {
  const [gitStatus, setGitStatus] = useState<GitStatusResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [commitDialogOpen, setCommitDialogOpen] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [diffOpen, setDiffOpen] = useState(false)
  const [diffResult, setDiffResult] = useState<GitDiffResult | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // ── Status polling ─────────────────────────────────────────────

  const refreshStatus = useCallback(async () => {
    try {
      const status = await gitApi.status(cwd)
      setGitStatus(status)
    } catch {
      // silently ignore — status just won't update
    } finally {
      setIsLoading(false)
    }
  }, [cwd])

  useEffect(() => {
    refreshStatus()
    if (pollInterval > 0) {
      const id = setInterval(refreshStatus, pollInterval)
      return () => clearInterval(id)
    }
  }, [refreshStatus, pollInterval])

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  // ── Derived state ──────────────────────────────────────────────

  const isDefaultBranch = useMemo(() => {
    const b = gitStatus?.branch
    if (!b) return false
    return b === 'main' || b === 'master'
  }, [gitStatus?.branch])

  const menuItems = useMemo(() => buildMenuItems(gitStatus, isBusy), [gitStatus, isBusy])
  const quickAction = useMemo(() => resolveQuickAction(gitStatus, isBusy, isDefaultBranch), [gitStatus, isBusy, isDefaultBranch])

  // ── Actions ────────────────────────────────────────────────────

  const runStackedAction = useCallback(async (
    action: GitStackedAction,
    opts?: { commitMessage?: string; featureBranch?: boolean; forcePushOnly?: boolean },
  ) => {
    setIsBusy(true)
    setMenuOpen(false)
    const toastId = toast.loading(
      action === 'commit' ? 'Committing...' :
      action === 'commit_push' ? (opts?.forcePushOnly ? 'Pushing...' : 'Committing & pushing...') :
      'Committing, pushing & creating PR...',
    )
    try {
      const result = await gitApi.runStackedAction(cwd, action, {
        commitMessage: opts?.commitMessage,
        featureBranch: opts?.featureBranch,
      })
      const summary = summarizeGitResult(result)
      toast.success(summary.title, { id: toastId, description: summary.description })

      // Offer follow-up actions
      if (action === 'commit' && result.commit.status === 'created') {
        toast.info('Changes committed. Push when ready.', {
          action: { label: 'Push', onClick: () => runStackedAction('commit_push', { forcePushOnly: true }) },
        })
      }
      if ((action === 'commit_push' || action === 'commit_push_pr') && result.pr.url) {
        toast.success('PR is ready', {
          action: { label: 'Open PR', onClick: () => window.open(result.pr.url, '_blank') },
        })
      } else if (result.push.status === 'pushed' && result.push.createPrUrl && result.pr.status !== 'created' && result.pr.status !== 'opened_existing') {
        toast.info('Create a pull request for your changes', {
          action: { label: 'Create PR', onClick: () => window.open(result.push.createPrUrl, '_blank') },
          duration: 10000,
        })
      }

      await refreshStatus()
    } catch (err) {
      toast.error('Action failed', { id: toastId, description: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setIsBusy(false)
    }
  }, [cwd, refreshStatus])

  const runPull = useCallback(async () => {
    setIsBusy(true)
    const toastId = toast.loading('Pulling...')
    try {
      const result = await gitApi.pull(cwd)
      toast.success(result.status === 'pulled' ? 'Pulled' : 'Already up to date', {
        id: toastId,
        description: result.status === 'pulled'
          ? `Updated ${result.branch} from ${result.upstreamBranch ?? 'upstream'}`
          : `${result.branch} is already synchronized.`,
      })
      await refreshStatus()
    } catch (err) {
      toast.error('Pull failed', { id: toastId, description: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setIsBusy(false)
    }
  }, [cwd, refreshStatus])

  const runQuickAction = useCallback(() => {
    if (quickAction.kind === 'open_pr' && gitStatus?.pr?.url) {
      window.open(gitStatus.pr.url, '_blank')
      return
    }
    if (quickAction.kind === 'run_pull') {
      runPull()
      return
    }
    if (quickAction.kind === 'show_hint') {
      toast.info(quickAction.label, { description: quickAction.hint })
      return
    }
    if (quickAction.action) {
      if (quickAction.action === 'commit') {
        setCommitDialogOpen(true)
      } else {
        runStackedAction(quickAction.action)
      }
    }
  }, [quickAction, gitStatus?.pr?.url, runPull, runStackedAction])

  const handleMenuItemClick = useCallback((item: GitActionMenuItem) => {
    if (item.disabled) return
    setMenuOpen(false)
    if (item.kind === 'open_pr' && gitStatus?.pr?.url) {
      window.open(gitStatus.pr.url, '_blank')
      return
    }
    if (item.dialogAction === 'push') {
      runStackedAction('commit_push', { forcePushOnly: true })
      return
    }
    if (item.dialogAction === 'create_pr') {
      runStackedAction('commit_push_pr')
      return
    }
    // commit → open dialog
    setCommitDialogOpen(true)
  }, [gitStatus?.pr?.url, runStackedAction])

  const submitCommit = useCallback(() => {
    const msg = commitMessage.trim()
    setCommitDialogOpen(false)
    setCommitMessage('')
    runStackedAction('commit', { commitMessage: msg || undefined })
  }, [commitMessage, runStackedAction])

  const submitCommitOnNewBranch = useCallback(() => {
    const msg = commitMessage.trim()
    setCommitDialogOpen(false)
    setCommitMessage('')
    runStackedAction('commit', { commitMessage: msg || undefined, featureBranch: true })
  }, [commitMessage, runStackedAction])

  const openDiff = useCallback(async () => {
    setDiffLoading(true)
    setDiffOpen(true)
    try {
      const result = await gitApi.diff(cwd)
      setDiffResult(result)
    } catch (err) {
      toast.error('Failed to load diff', { description: err instanceof Error ? err.message : 'Unknown error' })
      setDiffOpen(false)
    } finally {
      setDiffLoading(false)
    }
  }, [cwd])

  // ── Render ─────────────────────────────────────────────────────

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
  }

  return (
    <div className="relative inline-flex items-center gap-2">
      {/* View changes button */}
      {gitStatus?.hasWorkingTreeChanges && (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs gap-1"
          disabled={diffLoading}
          onClick={openDiff}
        >
          {diffLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
          View changes
        </Button>
      )}

      {/* Quick action + menu */}
      <div className="flex items-center gap-0.5" ref={menuRef}>
        <Button
          variant="outline"
          size="sm"
          className="rounded-r-none text-xs gap-1"
          disabled={quickAction.disabled || isBusy}
          onClick={runQuickAction}
        >
          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <QuickActionIcon quickAction={quickAction} />}
          {quickAction.label}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="rounded-l-none border-l-0 px-1.5"
          disabled={isBusy}
          onClick={() => { setMenuOpen(!menuOpen); refreshStatus() }}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>

        {/* Dropdown menu */}
        {menuOpen && (
          <div className="absolute top-full left-0 mt-1 z-50 w-48 rounded-md border bg-popover p-1 shadow-md">
            {menuItems.map((item) => (
              <button
                key={`${item.id}-${item.label}`}
                className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm ${
                  item.disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent cursor-pointer'
                }`}
                disabled={item.disabled}
                onClick={() => handleMenuItemClick(item)}
              >
                <ActionIcon icon={item.icon} />
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Commit dialog (popover-style) */}
      {commitDialogOpen && (
        <div className="absolute top-full right-0 mt-1 z-50 w-80 rounded-md border bg-popover p-3 shadow-md space-y-2">
          <p className="text-sm font-medium">Commit changes</p>
          <p className="text-xs text-muted-foreground">Leave blank to auto-generate a commit message.</p>
          {isDefaultBranch && (
            <p className="text-xs text-yellow-600">Warning: committing to default branch</p>
          )}
          <Input
            placeholder="Commit message (optional)"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submitCommit()
              }
            }}
            className="text-sm"
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => { setCommitDialogOpen(false); setCommitMessage('') }}>
              Cancel
            </Button>
            <Button variant="outline" size="sm" onClick={submitCommitOnNewBranch}>
              Commit on new branch
            </Button>
            <Button size="sm" onClick={submitCommit}>
              Commit
            </Button>
          </div>
        </div>
      )}

      {/* Diff view dialog (full-screen overlay) */}
      {diffOpen && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-popover border rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-medium">Changes</h3>
                {diffResult && (
                  <span className="text-xs text-muted-foreground">
                    {diffResult.files.length} file{diffResult.files.length !== 1 ? 's' : ''} changed
                  </span>
                )}
              </div>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDiffOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {diffLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : diffResult && !diffResult.hasChanges ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                No changes detected.
              </div>
            ) : diffResult ? (
              <div className="flex-1 overflow-auto">
                {/* File list */}
                <div className="px-4 py-2 border-b bg-muted/30">
                  <div className="flex flex-wrap gap-1">
                    {diffResult.files.map((f) => (
                      <span key={f} className="text-xs px-1.5 py-0.5 rounded bg-muted font-mono">{f}</span>
                    ))}
                  </div>
                </div>
                {/* Diff content */}
                <pre className="p-4 text-xs font-mono leading-5 overflow-x-auto whitespace-pre">
                  {diffResult.diff.split('\n').map((line, i) => {
                    let cls = 'text-foreground'
                    if (line.startsWith('+') && !line.startsWith('+++')) cls = 'text-green-600 dark:text-green-400'
                    else if (line.startsWith('-') && !line.startsWith('---')) cls = 'text-red-600 dark:text-red-400'
                    else if (line.startsWith('@@')) cls = 'text-blue-600 dark:text-blue-400'
                    else if (line.startsWith('diff ') || line.startsWith('index ')) cls = 'text-muted-foreground font-semibold'
                    else if (line.startsWith('#')) cls = 'text-muted-foreground italic'
                    return <span key={i} className={cls}>{line}{'\n'}</span>
                  })}
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
