/**
 * EditDiffView — shows a unified diff for file edit tool calls.
 *
 * Inspired by VS Code Copilot Chat's inline diff/textEdit rendering.
 * Displays old vs new content as a color-coded unified diff.
 */
interface EditDiffViewProps {
    /** File path that was edited */
    filePath: string;
    /** For file.patch: the original search text */
    oldText?: string;
    /** For file.patch: the replacement text */
    newText?: string;
    /** For file.write: the full written content (no diff, just show preview) */
    writtenContent?: string;
    /** Whether this is a new file creation */
    isNewFile?: boolean;
    className?: string;
}
export declare function EditDiffView({ filePath, oldText, newText, writtenContent, isNewFile, className, }: EditDiffViewProps): import("react").JSX.Element | null;
export {};
//# sourceMappingURL=edit-diff-view.d.ts.map