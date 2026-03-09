/**
 * GitDiffViewer — Monaco-based per-file diff viewer for Manager mode.
 *
 * Fetches per-file original/modified content and renders a read-only
 * Monaco DiffEditor with a file selector sidebar.
 */
interface GitDiffViewerProps {
    cwd: string;
    /** When provided, diffs are scoped to changes since this branch (thread-scoped). */
    baseBranch?: string;
    onClose: () => void;
}
export declare function GitDiffViewer({ cwd, baseBranch, onClose }: GitDiffViewerProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=GitDiffViewer.d.ts.map