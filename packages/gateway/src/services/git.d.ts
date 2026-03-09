/**
 * Server-side git operations service.
 *
 * Executes git and `gh` CLI commands in the requested working directory.
 * Adapted from the t3code GitService/GitManager pattern but running
 * directly through child_process on the gateway.
 */
export type GitStackedAction = "commit" | "commit_push" | "commit_push_pr";
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
    state: "open" | "closed" | "merged";
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
    /** Whether GitHub CLI (`gh`) is installed and authenticated. */
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
        status: "created" | "skipped_no_changes";
        commitSha?: string;
        subject?: string;
    };
    push: {
        status: "pushed" | "skipped_not_requested" | "skipped_up_to_date" | "skipped_no_remote";
        branch?: string;
        upstreamBranch?: string;
        setUpstream?: boolean;
        createPrUrl?: string;
    };
    branch: {
        status: "created" | "skipped_not_requested";
        name?: string;
    };
    pr: {
        status: "created" | "opened_existing" | "skipped_not_requested" | "skipped_no_remote";
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
    status: "pulled" | "skipped_up_to_date";
    branch: string;
    upstreamBranch: string | null;
}
export interface GitWorktreeResult {
    path: string;
    branch: string;
}
export declare class GitService {
    isRepo(cwd: string): Promise<boolean>;
    init(cwd: string): Promise<void>;
    status(cwd: string, _branch?: string, githubToken?: string): Promise<GitStatusResult>;
    listBranches(cwd: string): Promise<GitListBranchesResult>;
    pull(cwd: string): Promise<GitPullResult>;
    runStackedAction(cwd: string, action: GitStackedAction, commitMessage?: string, featureBranch?: boolean, baseBranch?: string, githubToken?: string): Promise<GitStepResult>;
    checkout(cwd: string, branch: string): Promise<void>;
    createBranch(cwd: string, branch: string): Promise<void>;
    /**
     * Create a git worktree for a new branch.
     * Worktrees live under ~/.jait/worktrees/{repoName}/{sanitizedBranch}.
     * Uses `git worktree add -b <newBranch> <path> <baseBranch>`.
     */
    createWorktree(cwd: string, baseBranch: string, newBranch: string, customPath?: string): Promise<GitWorktreeResult>;
    /** Remove a git worktree. */
    removeWorktree(cwd: string, worktreePath: string, force?: boolean): Promise<void>;
    /**
     * Clean up a worktree directory created for a thread.
     * Resolves the main repo root, runs `git worktree remove --force`,
     * and falls back to deleting the directory if that fails.
     * No-ops silently when the path is not a worktree or doesn't exist.
     */
    cleanupWorktree(worktreePath: string): Promise<void>;
    /** Get the top-level git directory (the main repo root, even from a worktree). */
    getMainRepoRoot(cwd: string): Promise<string>;
    /** Check whether a named remote (e.g. "origin") exists. */
    hasRemote(cwd: string, name: string): Promise<boolean>;
    /** Get the remote URL for a named remote, or null if not set. */
    getRemoteUrl(cwd: string, name: string): Promise<string | null>;
    /** List configured remote names. */
    listRemotes(cwd: string): Promise<string[]>;
    /**
     * Resolve the best remote for push/PR operations.
     * Priority: branch-specific remote -> origin -> first configured remote.
     * Falls back to main repo root remotes for worktrees.
     */
    getPreferredRemote(cwd: string, branch?: string): Promise<string | null>;
    /**
     * Resolve the repository's default branch (e.g. "main" or "master").
     * Tries gh CLI first, then falls back to common defaults.
     */
    resolveDefaultBranch(cwd: string): Promise<string>;
    private createGithubPrViaApi;
    private fetchGithubPrByHead;
    /**
     * Generate a pull request body from the diff between base and head.
     * Collects commit log + diff stat and formats as markdown.
     */
    generatePrBody(cwd: string, baseBranch: string, headBranch: string, prTitle: string): Promise<string>;
    /**
     * Build a URL to create a new pull request on the hosting provider.
     * Supports GitHub, GitLab, Bitbucket, and Azure DevOps remote URLs.
     */
    buildCreatePrUrl(cwd: string, branch: string, remoteName?: string): Promise<string | undefined>;
    /** Return the diff of uncommitted changes (staged + unstaged). */
    diff(cwd: string): Promise<GitDiffResult>;
    /**
     * Return per-file original and modified content so the frontend can
     * render a Monaco diff editor.
     *
     * @param baseBranch — when given, diff working tree against that branch
     *   (shows all thread changes: committed + uncommitted). When omitted,
     *   only uncommitted working-tree changes are returned (original = HEAD).
     */
    fileDiffs(cwd: string, baseBranch?: string): Promise<FileDiffEntry[]>;
    /**
     * Diff working tree against a base branch (shows all committed + uncommitted changes).
     */
    private fileDiffsBranch;
}
//# sourceMappingURL=git.d.ts.map