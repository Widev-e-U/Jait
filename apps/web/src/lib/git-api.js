/**
 * Git API client — talks to /api/git/* on the Jait gateway.
 *
 * Mirrors the t3code gitReactQuery pattern but uses HTTP instead of IPC.
 */
import { getApiUrl } from '@/lib/gateway-url';
const API_URL = getApiUrl();
// ── Helpers ──────────────────────────────────────────────────────────
function getToken() {
    return localStorage.getItem('token');
}
function authHeaders(json = false) {
    const h = {};
    if (json)
        h['Content-Type'] = 'application/json';
    const token = getToken();
    if (token)
        h['Authorization'] = `Bearer ${token}`;
    return h;
}
async function gitPost(path, body) {
    const res = await fetch(`${API_URL}/api/git/${path}`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Git ${path} failed: ${res.statusText}`);
    }
    return res.json();
}
// ── Public API ───────────────────────────────────────────────────────
export const gitApi = {
    status(cwd, branch) {
        return gitPost('status', {
            cwd,
            ...(branch ? { branch } : {}),
        });
    },
    listBranches(cwd) {
        return gitPost('branches', { cwd });
    },
    pull(cwd) {
        return gitPost('pull', { cwd });
    },
    runStackedAction(cwd, action, opts) {
        return gitPost('run-stacked-action', {
            cwd,
            action,
            ...(opts?.commitMessage ? { commitMessage: opts.commitMessage } : {}),
            ...(opts?.featureBranch ? { featureBranch: true } : {}),
            ...(opts?.baseBranch ? { baseBranch: opts.baseBranch } : {}),
        });
    },
    checkout(cwd, branch) {
        return gitPost('checkout', { cwd, branch });
    },
    createBranch(cwd, branch, baseBranch) {
        return gitPost('create-branch', { cwd, branch, baseBranch });
    },
    init(cwd) {
        return gitPost('init', { cwd });
    },
    diff(cwd) {
        return gitPost('diff', { cwd });
    },
    fileDiffs(cwd, baseBranch) {
        return gitPost('file-diffs', { cwd, ...(baseBranch ? { baseBranch } : {}) }).then(r => r.files);
    },
    createWorktree(cwd, baseBranch, newBranch, path) {
        return gitPost('create-worktree', { cwd, baseBranch, newBranch, ...(path ? { path } : {}) });
    },
    removeWorktree(cwd, path, force = false) {
        return gitPost('remove-worktree', { cwd, path, force });
    },
};
export function buildMenuItems(gitStatus, isBusy) {
    if (!gitStatus)
        return [];
    const hasBranch = gitStatus.branch !== null;
    const hasChanges = gitStatus.hasWorkingTreeChanges;
    const hasOpenPr = gitStatus.pr?.state === 'open';
    const isBehind = gitStatus.behindCount > 0;
    const canCommit = !isBusy && hasChanges;
    const canPush = !isBusy && hasBranch && !hasChanges && !isBehind && gitStatus.aheadCount > 0;
    const canCreatePr = !isBusy && hasBranch && !hasChanges && !hasOpenPr && gitStatus.aheadCount > 0 && !isBehind;
    const canOpenPr = !isBusy && hasOpenPr;
    return [
        { id: 'commit', label: 'Commit', disabled: !canCommit, icon: 'commit', kind: 'open_dialog', dialogAction: 'commit' },
        { id: 'push', label: 'Push', disabled: !canPush, icon: 'push', kind: 'open_dialog', dialogAction: 'push' },
        hasOpenPr
            ? { id: 'pr', label: 'Open PR', disabled: !canOpenPr, icon: 'pr', kind: 'open_pr' }
            : { id: 'pr', label: 'Create PR', disabled: !canCreatePr, icon: 'pr', kind: 'open_dialog', dialogAction: 'create_pr' },
    ];
}
export function resolveQuickAction(gitStatus, isBusy, isDefaultBranch = false) {
    if (isBusy)
        return { label: 'Commit', disabled: true, kind: 'show_hint', hint: 'Git action in progress.' };
    if (!gitStatus)
        return { label: 'Commit', disabled: true, kind: 'show_hint', hint: 'Git status is unavailable.' };
    const hasBranch = gitStatus.branch !== null;
    const hasChanges = gitStatus.hasWorkingTreeChanges;
    const hasOpenPr = gitStatus.pr?.state === 'open';
    const isAhead = gitStatus.aheadCount > 0;
    const isBehind = gitStatus.behindCount > 0;
    if (!hasBranch)
        return { label: 'Commit', disabled: true, kind: 'show_hint', hint: 'Create and checkout a branch before pushing or opening a PR.' };
    if (hasChanges) {
        if (hasOpenPr || isDefaultBranch)
            return { label: 'Commit & push', disabled: false, kind: 'run_action', action: 'commit_push' };
        return { label: 'Commit, push & create PR', disabled: false, kind: 'run_action', action: 'commit_push_pr' };
    }
    if (!gitStatus.hasUpstream) {
        if (!isAhead) {
            if (hasOpenPr)
                return { label: 'Open PR', disabled: false, kind: 'open_pr' };
            return { label: 'Push', disabled: true, kind: 'show_hint', hint: 'No local commits to push.' };
        }
        if (hasOpenPr || isDefaultBranch)
            return { label: 'Push', disabled: false, kind: 'run_action', action: 'commit_push' };
        return { label: 'Push & create PR', disabled: false, kind: 'run_action', action: 'commit_push_pr' };
    }
    if (isAhead && isBehind)
        return { label: 'Sync branch', disabled: true, kind: 'show_hint', hint: 'Branch has diverged from upstream. Rebase/merge first.' };
    if (isBehind)
        return { label: 'Pull', disabled: false, kind: 'run_pull' };
    if (isAhead) {
        if (hasOpenPr || isDefaultBranch)
            return { label: 'Push', disabled: false, kind: 'run_action', action: 'commit_push' };
        return { label: 'Push & create PR', disabled: false, kind: 'run_action', action: 'commit_push_pr' };
    }
    if (hasOpenPr && gitStatus.hasUpstream)
        return { label: 'Open PR', disabled: false, kind: 'open_pr' };
    return { label: 'Commit', disabled: true, kind: 'show_hint', hint: 'Branch is up to date. No action needed.' };
}
export function buildGitActionProgressStages(input) {
    const branchStages = input.featureBranch ? ['Preparing feature branch...'] : [];
    const shouldIncludeCommitStages = !input.forcePushOnly && (input.action === 'commit' || input.hasWorkingTreeChanges);
    const commitStages = !shouldIncludeCommitStages ? [] : input.hasCustomCommitMessage ? ['Committing...'] : ['Generating commit message...', 'Committing...'];
    const pushStage = input.pushTarget ? `Pushing to ${input.pushTarget}...` : 'Pushing...';
    if (input.action === 'commit')
        return [...branchStages, ...commitStages];
    if (input.action === 'commit_push')
        return [...branchStages, ...commitStages, pushStage];
    return [...branchStages, ...commitStages, pushStage, 'Creating PR...'];
}
export function summarizeGitResult(result) {
    if (result.push.status === 'skipped_no_remote') {
        const sha = result.commit.commitSha?.slice(0, 7);
        return {
            title: sha ? `Committed ${sha}` : 'Committed changes',
            description: 'No remote configured — push skipped. Add a remote with `git remote add <name> <url>` to enable push & PR.',
        };
    }
    if (result.pr.status === 'created' || result.pr.status === 'opened_existing') {
        const prNumber = result.pr.number ? ` #${result.pr.number}` : '';
        const title = `${result.pr.status === 'created' ? 'Created PR' : 'Opened PR'}${prNumber}`;
        return result.pr.title ? { title, description: result.pr.title.slice(0, 72) } : { title };
    }
    if (result.push.status === 'pushed') {
        const sha = result.commit.commitSha?.slice(0, 7);
        const branch = result.push.upstreamBranch ?? result.push.branch;
        return { title: `Pushed${sha ? ` ${sha}` : ''}${branch ? ` to ${branch}` : ''}`, description: result.commit.subject?.slice(0, 72) };
    }
    if (result.commit.status === 'created') {
        const sha = result.commit.commitSha?.slice(0, 7);
        return { title: sha ? `Committed ${sha}` : 'Committed changes', description: result.commit.subject?.slice(0, 72) };
    }
    return { title: 'Done' };
}
//# sourceMappingURL=git-api.js.map