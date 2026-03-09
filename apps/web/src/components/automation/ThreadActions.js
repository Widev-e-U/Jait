import { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, GitPullRequest, Loader2, AlertTriangle } from 'lucide-react';
import { summarizeGitResult } from '@/lib/git-api';
import { agentsApi } from '@/lib/agents-api';
import { toast } from 'sonner';
import { GitDiffViewer } from './GitDiffViewer';
export function ThreadActions({ threadId, cwd, branch, baseBranch, threadTitle, prUrl, prState, ghAvailable = true, threadStatus }) {
    const [busy, setBusy] = useState(false);
    const [diffOpen, setDiffOpen] = useState(false);
    const [prLink, setPrLink] = useState(prUrl ? { url: prUrl, kind: 'created' } : null);
    // Sync incoming prUrl prop (e.g. from WS updates) without losing a manually stored create-link
    useEffect(() => {
        setPrLink((prev) => {
            if (prUrl)
                return { url: prUrl, kind: 'created' };
            // Keep the "create" link if we only have the manual page
            if (prev?.kind === 'create')
                return prev;
            return null;
        });
    }, [prUrl]);
    const existingPrLink = prLink ?? (prUrl ? { url: prUrl, kind: 'created' } : null);
    const buttonLabel = existingPrLink
        ? existingPrLink.kind === 'created'
            ? 'Open PR'
            : 'Open PR Page'
        : 'Create Pull Request';
    const canCreatePr = existingPrLink != null || threadStatus === 'completed';
    const handlePushAndPR = useCallback(async () => {
        // If PR already exists, just open it
        if (existingPrLink) {
            window.open(existingPrLink.url, '_blank');
            return;
        }
        if (threadStatus !== 'completed') {
            toast.error('Thread not completed', { description: 'Finish the thread before creating a pull request.' });
            return;
        }
        setBusy(true);
        const toastId = toast.loading('Creating pull request…');
        try {
            const commitMsg = threadTitle.replace(/^\[.*?\]\s*/, '');
            const response = await agentsApi.createPullRequest(threadId, {
                commitMessage: commitMsg,
                baseBranch,
            });
            const result = response.result;
            const summary = summarizeGitResult(result);
            toast.success(summary.title, { id: toastId, description: summary.description });
            if (result.pr.url) {
                setPrLink({ url: result.pr.url, kind: 'created' });
                try {
                    await agentsApi.updateThread(threadId, {
                        prUrl: result.pr.url,
                        prNumber: result.pr.number ?? null,
                        prTitle: result.pr.title ?? null,
                        prState: 'open',
                    });
                }
                catch {
                    // PR creation succeeded; sidebar metadata sync can fail independently.
                }
                window.open(result.pr.url, '_blank');
            }
            else if (result.push.createPrUrl) {
                setPrLink({ url: result.push.createPrUrl, kind: 'create' });
            }
        }
        catch (err) {
            toast.error('Failed', { id: toastId, description: err instanceof Error ? err.message : 'Unknown error' });
        }
        finally {
            setBusy(false);
        }
    }, [baseBranch, threadId, threadStatus, threadTitle, existingPrLink]);
    return (<>
      <div className="inline-flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-5 text-[10px] gap-1" onClick={() => setDiffOpen(true)}>
          <Eye className="h-3 w-3"/>
          Changes
        </Button>
        <Button variant="ghost" size="sm" className="h-5 text-[10px] gap-1" disabled={busy || !canCreatePr} onClick={handlePushAndPR} title={!existingPrLink && threadStatus !== 'completed' ? 'Finish the thread before creating a pull request.' : undefined}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin"/> : <GitPullRequest className="h-3 w-3"/>}
          {buttonLabel}
        </Button>
        {existingPrLink && (<Badge variant="outline" className={`h-5 px-1.5 text-[10px] font-medium ${prState === 'merged'
                ? 'border-purple-500/40 text-purple-700 bg-purple-500/10 dark:text-purple-300 dark:bg-purple-500/20 dark:border-purple-400/40'
                : prState === 'closed'
                    ? 'border-red-500/40 text-red-700 bg-red-500/10 dark:text-red-300 dark:bg-red-500/20 dark:border-red-400/40'
                    : existingPrLink.kind === 'created'
                        ? 'border-green-500/40 text-green-700 dark:text-green-300 dark:border-green-400/40'
                        : 'border-amber-500/40 text-amber-700 dark:text-amber-300 dark:border-amber-400/40'}`}>
            {prState === 'merged'
                ? 'PR merged'
                : prState === 'closed'
                    ? 'PR closed'
                    : existingPrLink.kind === 'created'
                        ? 'PR open'
                        : 'PR ready to open'}
          </Badge>)}
        {!ghAvailable && !existingPrLink && (<span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 cursor-help" title="GitHub CLI (gh) is not installed. Install it or configure a GitHub token to enable PR creation and status tracking.">
            <AlertTriangle className="h-3 w-3"/>
          </span>)}
      </div>

      {diffOpen && (<GitDiffViewer cwd={cwd} baseBranch={branch ? baseBranch : undefined} onClose={() => setDiffOpen(false)}/>)}
    </>);
}
//# sourceMappingURL=ThreadActions.js.map