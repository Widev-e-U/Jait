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
  GitFork,
  Loader2,
  ArrowDownToLine,
  Eye,
} from 'lucide-react'
import {
  gitApi,
  buildMenuItems,
  resolveQuickAction,
  isMissingGitIdentityError,
  type GitStatusResult,
  type GitStackedAction,
  type GitActionMenuItem,
  type GitQuickAction,
} from '@/lib/git-api'
import { toast } from 'sonner'
import { GitDiffViewer } from './GitDiffViewer'
import { GhSetupDialog } from './GhSetupDialog'
import { GitIdentityDialog } from './GitIdentityDialog'

interface GitActionsControlProps {
  /** Absolute path to the git repo working directory */
  cwd: string
  /**
   * When this value changes, git status is re-fetched.
   * Pass e.g. the selected thread's status or updatedAt.
   */
  refreshTrigger?: unknown
}

// ── Sub-components ───────────────────────────────────────────────────

function ActionIcon({ icon }: { icon: 'commit' | 'push' | 'pr' }) {
  if (icon === 'commit') return <GitCommit className="h-3.5 w-3.5" />
  if (icon === 'push') return <CloudUpload className="h-3.5 w-3.5" />
  return <GitFork className="h-3.5 w-3.5" />
}

function QuickActionIcon({ quickAction }: { quickAction: GitQuickAction }) {
  if (quickAction.kind === 'open_pr') return <GitFork className="h-3.5 w-3.5" />
  if (quickAction.kind === 'run_pull') return <ArrowDownToLine className="h-3.5 w-3.5" />
  if (quickAction.kind === 'run_action') {
    if (quickAction.action === 'commit') return <GitCommit className="h-3.5 w-3.5" />
    if (quickAction.action === 'commit_push') return <CloudUpload className="h-3.5 w-3.5" />
    return <GitFork className="h-3.5 w-3.5" />
  }
  return <GitCommit className="h-3.5 w-3.5" />
}

// ── Main component ───────────────────────────────────────────────────

export function GitActionsControl({ cwd, refreshTrigger }: GitActionsControlProps) {
  const [gitStatus, setGitStatus] = useState<GitStatusResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isBusy, setIsBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [commitDialogOpen, setCommitDialogOpen] = useState(false)
  const [commitMessage, setCommitMessage] = useState('')
  const [diffOpen, setDiffOpen] = useState(false)
  const [ghSetupOpen, setGhSetupOpen] = useState(false)
  const [gitIdentityOpen, setGitIdentityOpen] = useState(false)
  const pendingPrAction = useRef<{ action: GitStackedAction; opts?: { commitMessage?: string; featureBranch?: boolean; forcePushOnly?: boolean } } | null>(null)
  const pendingIdentityAction = useRef<{ action: GitStackedAction; opts?: { commitMessage?: string; featureBranch?: boolean; forcePushOnly?: boolean } } | null>(null)
  const skipGhCheck = useRef(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // ── Status refresh (event-driven, no polling) ─────────────────

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

  // Fetch on mount + whenever refreshTrigger changes (e.g. thread status)
  useEffect(() => {
    refreshStatus()
  }, [refreshStatus, refreshTrigger])

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
    // Pre-check gh for PR actions
    if (action === 'commit_push_pr' && !skipGhCheck.current) {
      try {
        const status = await gitApi.status(cwd)
        if (status.prProvider === 'github') {
          const ghStatus = await gitApi.ghStatus(cwd)
          if (!ghStatus.installed || !ghStatus.authenticated) {
            pendingPrAction.current = { action, opts }
            setGhSetupOpen(true)
            return
          }
        }
      } catch {
        // If check fails, proceed anyway
      }
    }
    skipGhCheck.current = false

    setIsBusy(true)
    setMenuOpen(false)
    try {
      await gitApi.runStackedAction(cwd, action, {
        commitMessage: opts?.commitMessage,
        featureBranch: opts?.featureBranch,
      })
      await refreshStatus()
    } catch (err) {
      if (isMissingGitIdentityError(err)) {
        pendingIdentityAction.current = { action, opts }
        setGitIdentityOpen(true)
        return
      }
      toast.error('Action failed', { description: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setIsBusy(false)
    }
  }, [cwd, refreshStatus])

  const runPull = useCallback(async () => {
    setIsBusy(true)
    try {
      await gitApi.pull(cwd)
      await refreshStatus()
    } catch (err) {
      toast.error('Pull failed', { description: err instanceof Error ? err.message : 'Unknown error' })
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

  const handleGhReady = useCallback(() => {
    if (pendingPrAction.current) {
      const { action, opts } = pendingPrAction.current
      pendingPrAction.current = null
      skipGhCheck.current = true
      runStackedAction(action, opts)
    }
  }, [runStackedAction])

  const handleGitIdentityReady = useCallback(() => {
    if (pendingIdentityAction.current) {
      const { action, opts } = pendingIdentityAction.current
      pendingIdentityAction.current = null
      runStackedAction(action, opts)
    }
  }, [runStackedAction])

  // ── Render ─────────────────────────────────────────────────────

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
  }

  return (
    <div className="relative inline-flex items-center gap-2">
      <GhSetupDialog
        open={ghSetupOpen}
        onOpenChange={setGhSetupOpen}
        cwd={cwd}
        onReady={handleGhReady}
      />
      <GitIdentityDialog
        open={gitIdentityOpen}
        onOpenChange={setGitIdentityOpen}
        cwd={cwd}
        onReady={handleGitIdentityReady}
      />
      {/* View changes button */}
      {gitStatus?.hasWorkingTreeChanges && (
        <Button
          variant="ghost"
          size="sm"
          className="text-xs gap-1"
          onClick={() => setDiffOpen(true)}
        >
          <Eye className="h-3.5 w-3.5" />
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

      {/* Monaco diff viewer */}
      {diffOpen && (
        <GitDiffViewer cwd={cwd} onClose={() => setDiffOpen(false)} />
      )}
    </div>
  )
}
