/**
 * GitActionsControl — Commit / Push / Create PR flow.
 *
 * Adapted from the t3code GitActionsControl but using HTTP API
 * instead of Electron IPC. Shows the quick-action button + drop-down
 * menu for git operations on a registered repository.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  ChevronDown,
  GitCommit,
  CloudUpload,
  Github,
  Loader2,
  ArrowDownToLine,
  AlertCircle,
  RefreshCw,
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
  const [error, setError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // ── Status polling ─────────────────────────────────────────────

  const refreshStatus = useCallback(async () => {
    try {
      const status = await gitApi.status(cwd)
      setGitStatus(status)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Git status failed')
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

  // ── Render ─────────────────────────────────────────────────────

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
  }

  return (
    <div className="relative">
      {/* Status summary */}
      <div className="flex items-center gap-2 mb-2">
        {gitStatus?.branch && (
          <Badge variant="outline" className="text-xs">
            {gitStatus.branch}
          </Badge>
        )}
        {gitStatus?.hasWorkingTreeChanges && (
          <Badge variant="secondary" className="text-xs">
            {gitStatus.workingTree.files.length} changed
          </Badge>
        )}
        {gitStatus?.pr && (
          <Badge variant={gitStatus.pr.state === 'open' ? 'default' : 'secondary'} className="text-xs cursor-pointer" onClick={() => window.open(gitStatus.pr!.url, '_blank')}>
            PR #{gitStatus.pr.number}
          </Badge>
        )}
        {gitStatus?.aheadCount ? (
          <span className="text-xs text-muted-foreground">↑{gitStatus.aheadCount}</span>
        ) : null}
        {gitStatus?.behindCount ? (
          <span className="text-xs text-muted-foreground">↓{gitStatus.behindCount}</span>
        ) : null}
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-auto" onClick={refreshStatus} disabled={isBusy}>
          <RefreshCw className={`h-3 w-3 ${isBusy ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-xs text-destructive mb-2">
          <AlertCircle className="h-3 w-3" />
          {error}
        </div>
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

      {/* Changed files list */}
      {gitStatus?.hasWorkingTreeChanges && gitStatus.workingTree.files.length > 0 && (
        <div className="mt-3 rounded-md border bg-muted/40 p-2">
          <p className="text-xs text-muted-foreground mb-1">Changed files</p>
          <ScrollArea className="max-h-32">
            <div className="space-y-0.5">
              {gitStatus.workingTree.files.map((file) => (
                <div key={file.path} className="flex items-center justify-between text-xs font-mono px-1 py-0.5">
                  <span className="truncate">{file.path}</span>
                  <span className="shrink-0 ml-2">
                    <span className="text-green-600">+{file.insertions}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-red-600">-{file.deletions}</span>
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
          <div className="flex justify-end text-xs font-mono mt-1">
            <span className="text-green-600">+{gitStatus.workingTree.insertions}</span>
            <span className="text-muted-foreground mx-1">/</span>
            <span className="text-red-600">-{gitStatus.workingTree.deletions}</span>
          </div>
        </div>
      )}

      {/* Commit dialog (inline) */}
      {commitDialogOpen && (
        <div className="mt-3 rounded-md border bg-background p-3 space-y-2">
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
    </div>
  )
}
