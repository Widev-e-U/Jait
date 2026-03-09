import { type ThreadStatus } from '@/lib/agents-api';
interface ThreadActionsProps {
    /** Thread id to persist PR metadata after creation/open. */
    threadId: string;
    /** Absolute path to the working directory. */
    cwd: string;
    /** The thread's feature branch (e.g. "jait/a1b2c3d4"). */
    branch?: string | null;
    /** The repository's default branch (e.g. "main"). */
    baseBranch: string;
    /** Thread title — used as commit message / PR title. */
    threadTitle: string;
    /** Existing PR URL from previous creation (allows retry to just open it). */
    prUrl?: string | null;
    /** Current PR state synced from GitHub (open, merged, closed). */
    prState?: 'open' | 'closed' | 'merged' | null;
    /** Whether GitHub CLI is available on the server. */
    ghAvailable?: boolean;
    /** Current thread lifecycle status. */
    threadStatus: ThreadStatus;
}
export declare function ThreadActions({ threadId, cwd, branch, baseBranch, threadTitle, prUrl, prState, ghAvailable, threadStatus }: ThreadActionsProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=ThreadActions.d.ts.map