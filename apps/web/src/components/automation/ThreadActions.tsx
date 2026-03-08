/**
 * ThreadActions — Compact action buttons shown in the toolbar in Manager mode
 * when a thread is completed / errored / interrupted.
 *
 * Shows "View changes" and "Push & Create PR" buttons inline.
 */

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
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
  /** The thread's feature branch (e.g. "jait/a1b2c3d4"). */
  branch?: string | null
  /** The repository's default branch (e.g. "main"). */
  baseBranch: string
  /** Thread title — used as commit message / PR title. */
  threadTitle: string
}

export function ThreadActions({ threadId, cwd, branch, baseBranch, threadTitle }: ThreadActionsProps) {
  const [busy, setBusy] = useState(false)
  const [diffOpen, setDiffOpen] = useState(false)

  const handlePushAndPR = useCallback(async () => {
    setBusy(true)
    const toastId = toast.loading('Creating pull request…')
    try {
      const commitMsg = threadTitle.replace(/^\[.*?\]\s*/, '')
      const result = await gitApi.runStackedAction(cwd, 'commit_push_pr', {
        commitMessage: commitMsg,
        baseBranch,
      })
      const summary = summarizeGitResult(result)
      toast.success(summary.title, { id: toastId, description: summary.description })

      if (result.pr.url) {
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
      }

      if (result.pr.url) {
        window.open(result.pr.url, '_blank')
      } else if (result.push.createPrUrl) {
        toast.info('Create a pull request', {
          action: { label: 'Open', onClick: () => window.open(result.push.createPrUrl, '_blank') },
          duration: 10000,
        })
      }
    } catch (err) {
      toast.error('Failed', { id: toastId, description: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setBusy(false)
    }
  }, [cwd, threadTitle, baseBranch])

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
          Create Pull Request
        </Button>
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
