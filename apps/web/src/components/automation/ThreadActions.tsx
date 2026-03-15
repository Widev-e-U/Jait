import { useState, useCallback, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Eye, GitPullRequest, Loader2, AlertTriangle, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { gitApi, type PrCheck } from '@/lib/git-api'
import { agentsApi, type ThreadStatus } from '@/lib/agents-api'
import { toast } from 'sonner'
import { GitDiffViewer } from './GitDiffViewer'
import { GhSetupDialog } from './GhSetupDialog'
import { useIsMobile } from '@/hooks/useIsMobile'

interface ThreadActionsProps {
  /** Thread id to persist PR metadata after creation/open. */
  threadId: string
  /** Absolute path to the working directory. */
  cwd: string
  /** The thread's feature branch (e.g. "jait/a1b2c3d4"). */
  branch?: string | null
  /** The repository's default branch (e.g. "main"). */
  baseBranch: string
  /** Thread title — used as commit message / PR title. */
  threadTitle: string
  /** Existing PR URL from previous creation (allows retry to just open it). */
  prUrl?: string | null
  /** Current PR state synced from GitHub (open, merged, closed). */
  prState?: 'open' | 'closed' | 'merged' | null
  /** Whether GitHub CLI is available on the server. */
  ghAvailable?: boolean
  /** Current thread lifecycle status. */
  threadStatus: ThreadStatus
  /** Whether to render the PR status badge next to the buttons. */
  showStatusBadge?: boolean
}

export function ThreadActions({
  threadId,
  cwd,
  branch,
  baseBranch,
  threadTitle,
  prUrl,
  prState,
  ghAvailable = true,
  threadStatus,
  showStatusBadge = true,
}: ThreadActionsProps) {
  const isMobile = useIsMobile()
  const [busy, setBusy] = useState(false)
  const [diffOpen, setDiffOpen] = useState(false)
  const [ghSetupOpen, setGhSetupOpen] = useState(false)
  const pendingPrAction = useRef(false)
  const skipGhCheck = useRef(false)
  const [prLink, setPrLink] = useState<{ url: string; kind: 'created' | 'create' } | null>(
    prUrl ? { url: prUrl, kind: 'created' } : null,
  )

  // Sync incoming prUrl prop (e.g. from WS updates) without losing a manually stored create-link
  useEffect(() => {
    setPrLink((prev) => {
      if (prUrl) return { url: prUrl, kind: 'created' as const }
      // Keep the "create" link if we only have the manual page
      if (prev?.kind === 'create') return prev
      return null
    })
  }, [prUrl])

  // ── CI checks polling ──────────────────────────────────────────────
  type ChecksStatus = 'pending' | 'passing' | 'failing' | null
  const [checksStatus, setChecksStatus] = useState<ChecksStatus>(null)
  const checksTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // Only poll checks when we have an open PR with a branch
    if (!branch || !prUrl || prState === 'merged' || prState === 'closed') {
      setChecksStatus(null)
      if (checksTimerRef.current) { clearInterval(checksTimerRef.current); checksTimerRef.current = null }
      return
    }

    const fetchChecks = async () => {
      try {
        const checks = await gitApi.prChecks(cwd, branch)
        if (!checks || checks.length === 0) { setChecksStatus(null); return }
        const hasFailing = checks.some((c: PrCheck) => c.conclusion === 'failure' || c.conclusion === 'cancelled')
        const hasPending = checks.some((c: PrCheck) => c.state === 'PENDING' || c.state === 'QUEUED' || c.state === 'IN_PROGRESS' || !c.conclusion)
        if (hasFailing) setChecksStatus('failing')
        else if (hasPending) setChecksStatus('pending')
        else setChecksStatus('passing')
      } catch {
        // Silently ignore — don't reset status on transient errors
      }
    }

    fetchChecks()
    checksTimerRef.current = setInterval(fetchChecks, 15_000)
    return () => { if (checksTimerRef.current) { clearInterval(checksTimerRef.current); checksTimerRef.current = null } }
  }, [branch, cwd, prUrl, prState])

  const existingPrLink = prLink ?? (prUrl ? { url: prUrl, kind: 'created' as const } : null)
  const buttonLabel = existingPrLink
    ? existingPrLink.kind === 'created'
      ? 'Open PR'
      : 'Open PR Page'
    : 'Create Pull Request'
  const prButtonTitle = existingPrLink ? buttonLabel : 'Create pull request'
  const canCreatePr = existingPrLink != null || threadStatus === 'completed'

  const handlePushAndPR = useCallback(async () => {
    // If PR already exists, just open it
    if (existingPrLink) {
      window.open(existingPrLink.url, '_blank')
      return
    }
    if (threadStatus !== 'completed') {
      toast.error('Thread not completed', { description: 'Finish the thread before creating a pull request.' })
      return
    }

    // Pre-check gh availability before attempting PR creation
    setBusy(true)
    if (!skipGhCheck.current) {
      try {
        const ghStatus = await gitApi.ghStatus(cwd)
        if (!ghStatus.installed || !ghStatus.authenticated) {
          setBusy(false)
          pendingPrAction.current = true
          setGhSetupOpen(true)
          return
        }
      } catch {
        // If check fails, proceed anyway — the PR creation will give a specific error
      }
    }
    skipGhCheck.current = false

    try {
      const commitMsg = threadTitle.replace(/^\[.*?\]\s*/, '')
      const response = await agentsApi.createPullRequest(threadId, {
        commitMessage: commitMsg,
        baseBranch,
      })
      const result = response.result

      if (response.pushFailed) {
        if (response.resumed) {
          toast.info('Push failed — thread resumed', {
            description: 'The agent is investigating the push failure and will fix the issue.',
          })
        } else {
          toast.error('Push failed', {
            description: response.error ?? 'Git push failed. Re-open the thread to fix the issue.',
          })
        }
      } else if (result.pr.url) {
        setPrLink({ url: result.pr.url, kind: 'created' })
      } else if (result.push.createPrUrl) {
        setPrLink({ url: result.push.createPrUrl, kind: 'create' })
      }
    } catch (err) {
      toast.error('Failed', { description: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setBusy(false)
    }
  }, [baseBranch, cwd, threadId, threadStatus, threadTitle, existingPrLink])

  const handleGhReady = useCallback(() => {
    if (pendingPrAction.current) {
      pendingPrAction.current = false
      skipGhCheck.current = true
      handlePushAndPR()
    }
  }, [handlePushAndPR])

  return (
    <>
      <GhSetupDialog
        open={ghSetupOpen}
        onOpenChange={setGhSetupOpen}
        cwd={cwd}
        onReady={handleGhReady}
      />
      <div className="inline-flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className={`h-5 text-[10px] gap-1 ${isMobile ? 'px-1.5' : ''}`}
          onClick={() => setDiffOpen(true)}
          title="Changes"
          aria-label="Changes"
        >
          <Eye className="h-3 w-3" />
          {!isMobile && 'Changes'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`h-5 text-[10px] gap-1 ${isMobile ? 'px-1.5' : ''}`}
          disabled={busy || !canCreatePr}
          onClick={handlePushAndPR}
          title={!existingPrLink && threadStatus !== 'completed' ? 'Finish the thread before creating a pull request.' : prButtonTitle}
          aria-label={prButtonTitle}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitPullRequest className="h-3 w-3" />}
          {!isMobile && buttonLabel}
        </Button>
        {showStatusBadge && existingPrLink && (
          <Badge
            variant="outline"
            className={`h-5 px-1.5 text-[10px] font-medium ${
              prState === 'merged'
                ? 'border-purple-500/40 text-purple-700 bg-purple-500/10 dark:text-purple-300 dark:bg-purple-500/20 dark:border-purple-400/40'
                : prState === 'closed'
                  ? 'border-red-500/40 text-red-700 bg-red-500/10 dark:text-red-300 dark:bg-red-500/20 dark:border-red-400/40'
                  : existingPrLink.kind === 'created'
                    ? 'border-green-500/40 text-green-700 dark:text-green-300 dark:border-green-400/40'
                    : 'border-amber-500/40 text-amber-700 dark:text-amber-300 dark:border-amber-400/40'
            }`}
          >
            {prState === 'merged'
              ? 'PR merged'
              : prState === 'closed'
                ? 'PR closed'
                : existingPrLink.kind === 'created'
                  ? 'PR open'
                  : 'PR ready to open'}
          </Badge>
        )}
        {showStatusBadge && existingPrLink?.kind === 'created' && prState === 'open' && checksStatus && (
          <Badge
            variant="outline"
            className={`h-5 px-1.5 text-[10px] font-medium inline-flex items-center gap-0.5 ${
              checksStatus === 'failing'
                ? 'border-red-500/40 text-red-700 bg-red-500/10 dark:text-red-300 dark:bg-red-500/20 dark:border-red-400/40'
                : checksStatus === 'pending'
                  ? 'border-amber-500/40 text-amber-700 bg-amber-500/10 dark:text-amber-300 dark:bg-amber-500/20 dark:border-amber-400/40'
                  : 'border-green-500/40 text-green-700 bg-green-500/10 dark:text-green-300 dark:bg-green-500/20 dark:border-green-400/40'
            }`}
          >
            {checksStatus === 'failing' ? <XCircle className="h-3 w-3" /> : checksStatus === 'pending' ? <Clock className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
            {checksStatus === 'failing' ? 'Checks failing' : checksStatus === 'pending' ? 'Checks pending' : 'Checks passed'}
          </Badge>
        )}
        {!ghAvailable && !existingPrLink && (
          <span
            className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 cursor-help"
            title="GitHub CLI (gh) is not installed. Install it or configure a GitHub token to enable PR creation and status tracking."
          >
            <AlertTriangle className="h-3 w-3" />
          </span>
        )}
      </div>

      {diffOpen && (
        <GitDiffViewer
          cwd={cwd}
          baseBranch={branch ? baseBranch : undefined}
          onClose={() => setDiffOpen(false)}
        />
      )}
    </>
  )
}
