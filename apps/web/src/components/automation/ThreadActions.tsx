import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Eye, GitPullRequest, Loader2 } from 'lucide-react'
import { gitApi, summarizeGitResult } from '@/lib/git-api'
import { agentsApi } from '@/lib/agents-api'
import { toast } from 'sonner'
import { GitDiffViewer } from './GitDiffViewer'

interface ThreadActionsProps {
  /** Thread id to persist PR metadata after creation/open. */
  threadId: string
  /** Absolute path to the working directory. */
  cwd: string
  /** Optional GitHub token for PR creation/status. */
  githubToken?: string | null
  /** The thread's feature branch (e.g. "jait/a1b2c3d4"). */
  branch?: string | null
  /** The repository's default branch (e.g. "main"). */
  baseBranch: string
  /** Thread title — used as commit message / PR title. */
  threadTitle: string
  /** Existing PR URL from previous creation (allows retry to just open it). */
  prUrl?: string | null
}

export function ThreadActions({ threadId, cwd, githubToken, branch, baseBranch, threadTitle, prUrl }: ThreadActionsProps) {
  const [busy, setBusy] = useState(false)
  const [diffOpen, setDiffOpen] = useState(false)
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

  const existingPrLink = prLink ?? (prUrl ? { url: prUrl, kind: 'created' as const } : null)
  const buttonLabel = existingPrLink
    ? existingPrLink.kind === 'created'
      ? 'Open PR'
      : 'Open PR Page'
    : 'Create Pull Request'

  const handlePushAndPR = useCallback(async () => {
    // If PR already exists, just open it
    if (existingPrLink) {
      window.open(existingPrLink.url, '_blank')
      return
    }

    setBusy(true)
    const toastId = toast.loading('Creating pull request…')
    try {
      const commitMsg = threadTitle.replace(/^\[.*?\]\s*/, '')
      const result = await gitApi.runStackedAction(cwd, 'commit_push_pr', {
        commitMessage: commitMsg,
        baseBranch,
        ...(githubToken ? { githubToken } : {}),
      })
      const summary = summarizeGitResult(result)
      toast.success(summary.title, { id: toastId, description: summary.description })

      if (result.pr.url) {
        setPrLink({ url: result.pr.url, kind: 'created' })
        try {
          await agentsApi.updateThread(threadId, {
            prUrl: result.pr.url,
            prNumber: result.pr.number ?? null,
            prTitle: result.pr.title ?? null,
            prState: 'open',
          })
        } catch {
          // PR creation succeeded; sidebar metadata sync can fail independently.
        }
        window.open(result.pr.url, '_blank')
      } else if (result.push.createPrUrl) {
        setPrLink({ url: result.push.createPrUrl, kind: 'create' })
      }
    } catch (err) {
      toast.error('Failed', { id: toastId, description: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setBusy(false)
    }
  }, [cwd, threadTitle, baseBranch, threadId, existingPrLink])

  return (
    <>
      <div className="inline-flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-5 text-[10px] gap-1" onClick={() => setDiffOpen(true)}>
          <Eye className="h-3 w-3" />
          Changes
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-5 text-[10px] gap-1"
          disabled={busy}
          onClick={handlePushAndPR}
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitPullRequest className="h-3 w-3" />}
          {buttonLabel}
        </Button>
        {existingPrLink && (
          <Badge
            variant="outline"
            className={`h-5 px-1.5 text-[10px] font-medium ${existingPrLink.kind === 'created' ? 'border-green-500/40 text-green-700' : 'border-amber-500/40 text-amber-700'}`}
          >
            {existingPrLink.kind === 'created' ? 'PR created' : 'PR ready to open'}
          </Badge>
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
