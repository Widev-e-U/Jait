/**
 * Git API client — talks to /api/git/* on the Jait gateway.
 *
 * Mirrors the t3code gitReactQuery pattern but uses HTTP instead of IPC.
 */
export type GitStackedAction = 'commit' | 'commit_push' | 'commit_push_pr';
export interface GitStatusFile {
    path: string;
    insertions: number;
    deletions: number;
}
export interface GitStatusPr {
    number: number;
    title: string;
    url: string;
    baseBranch: string;
    headBranch: string;
    state: 'open' | 'closed' | 'merged';
}
export interface GitStatusResult {
    branch: string | null;
    hasWorkingTreeChanges: boolean;
    workingTree: {
        files: GitStatusFile[];
        insertions: number;
        deletions: number;
    };
    hasUpstream: boolean;
    aheadCount: number;
    behindCount: number;
    pr: GitStatusPr | null;
    /** Whether GitHub CLI (`gh`) is installed and authenticated on the server. */
    ghAvailable: boolean;
}
export interface GitBranch {
    name: string;
    isRemote: boolean;
    current: boolean;
    isDefault: boolean;
    worktreePath: string | null;
}
export interface GitListBranchesResult {
    branches: GitBranch[];
    isRepo: boolean;
}
export interface GitStepResult {
    commit: {
        status: 'created' | 'skipped_no_changes';
        commitSha?: string;
        subject?: string;
    };
    push: {
        status: 'pushed' | 'skipped_not_requested' | 'skipped_up_to_date' | 'skipped_no_remote';
        branch?: string;
        upstreamBranch?: string;
        setUpstream?: boolean;
        createPrUrl?: string;
    };
    branch: {
        status: 'created' | 'skipped_not_requested';
        name?: string;
    };
    pr: {
        status: 'created' | 'opened_existing' | 'skipped_not_requested' | 'skipped_no_remote';
        url?: string;
        number?: number;
        baseBranch?: string;
        headBranch?: string;
        title?: string;
    };
}
export interface GitDiffResult {
    diff: string;
    files: string[];
    hasChanges: boolean;
}
export interface FileDiffEntry {
    path: string;
    /** Original (HEAD) content, empty for new files */
    original: string;
    /** Current working-tree content, empty for deleted files */
    modified: string;
    /** 'A' = added, 'M' = modified, 'D' = deleted, 'R' = renamed, '?' = untracked */
    status: string;
}
export interface GitPullResult {
    status: 'pulled' | 'skipped_up_to_date';
    branch: string;
    upstreamBranch: string | null;
}
export interface GitWorktreeResult {
    path: string;
    branch: string;
}
export declare const gitApi: {
    status(cwd: string, branch?: string): Promise<GitStatusResult>;
    listBranches(cwd: string): Promise<GitListBranchesResult>;
    pull(cwd: string): Promise<GitPullResult>;
    runStackedAction(cwd: string, action: GitStackedAction, opts?: {
        commitMessage?: string;
        featureBranch?: boolean;
        baseBranch?: string;
    }): Promise<GitStepResult>;
    checkout(cwd: string, branch: string): Promise<void>;
    createBranch(cwd: string, branch: string, baseBranch?: string): Promise<{
        ok: boolean;
        branch: string;
    }>;
    init(cwd: string): Promise<void>;
    diff(cwd: string): Promise<GitDiffResult>;
    fileDiffs(cwd: string, baseBranch?: string): Promise<FileDiffEntry[]>;
    createWorktree(cwd: string, baseBranch: string, newBranch: string, path?: string): Promise<GitWorktreeResult>;
    removeWorktree(cwd: string, path: string, force?: boolean): Promise<void>;
};
export type GitActionIconName = 'commit' | 'push' | 'pr';
export type GitDialogAction = 'commit' | 'push' | 'create_pr';
export interface GitActionMenuItem {
    id: 'commit' | 'push' | 'pr';
    label: string;
    disabled: boolean;
    icon: GitActionIconName;
    kind: 'open_dialog' | 'open_pr';
    dialogAction?: GitDialogAction;
}
export interface GitQuickAction {
    label: string;
    disabled: boolean;
    kind: 'run_action' | 'run_pull' | 'open_pr' | 'show_hint';
    action?: GitStackedAction;
    hint?: string;
}
export declare function buildMenuItems(gitStatus: GitStatusResult | null, isBusy: boolean): GitActionMenuItem[];
export declare function resolveQuickAction(gitStatus: GitStatusResult | null, isBusy: boolean, isDefaultBranch?: boolean): GitQuickAction;
export declare function buildGitActionProgressStages(input: {
    action: GitStackedAction;
    hasCustomCommitMessage: boolean;
    hasWorkingTreeChanges: boolean;
    forcePushOnly?: boolean;
    pushTarget?: string;
    featureBranch?: boolean;
}): string[];
export declare function summarizeGitResult(result: GitStepResult): {
    title: string;
    description?: string;
};
//# sourceMappingURL=git-api.d.ts.map