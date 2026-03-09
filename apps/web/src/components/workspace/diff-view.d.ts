export interface DiffHunk {
    /** Index in the hunks array */
    index: number;
    /** 1-based inclusive. 0 = pure insertion (nothing removed from original) */
    originalStartLineNumber: number;
    originalEndLineNumber: number;
    /** 1-based inclusive. 0 = pure deletion (nothing added in modified) */
    modifiedStartLineNumber: number;
    modifiedEndLineNumber: number;
    /** User decision for this hunk */
    state: 'undecided' | 'accepted' | 'rejected';
}
export interface DiffViewProps {
    filePath: string;
    originalContent: string;
    modifiedContent: string;
    language: string;
    onClose: () => void;
    /**
     * Called when the user applies all decisions.
     * `resultContent` is the merged file content after
     * selectively keeping / reverting each hunk.
     */
    onApply: (resultContent: string) => void;
}
export declare function DiffView({ filePath, originalContent, modifiedContent, language, onClose, onApply, }: DiffViewProps): import("react").JSX.Element;
//# sourceMappingURL=diff-view.d.ts.map