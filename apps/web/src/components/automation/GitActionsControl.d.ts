/**
 * GitActionsControl — Commit / Push / Create PR flow.
 *
 * Adapted from the t3code GitActionsControl but using HTTP API
 * instead of Electron IPC. Shows the quick-action button + drop-down
 * menu for git operations on a registered repository.
 */
interface GitActionsControlProps {
    /** Absolute path to the git repo working directory */
    cwd: string;
    /**
     * When this value changes, git status is re-fetched.
     * Pass e.g. the selected thread's status or updatedAt.
     */
    refreshTrigger?: unknown;
}
export declare function GitActionsControl({ cwd, refreshTrigger }: GitActionsControlProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=GitActionsControl.d.ts.map