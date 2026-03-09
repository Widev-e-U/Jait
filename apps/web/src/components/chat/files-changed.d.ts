export type FileChangeState = 'undecided' | 'accepted' | 'rejected';
export interface ChangedFile {
    path: string;
    name: string;
    state: FileChangeState;
}
interface FilesChangedProps {
    files: ChangedFile[];
    onAccept?: (path: string) => void;
    onReject?: (path: string) => void;
    onAcceptAll?: () => void;
    onRejectAll?: () => void;
    /** Open the diff view for a file */
    onFileClick?: (path: string) => void;
    className?: string;
}
export declare function FilesChanged({ files, onAccept, onReject, onAcceptAll, onRejectAll, onFileClick, className, }: FilesChangedProps): import("react").JSX.Element | null;
export {};
//# sourceMappingURL=files-changed.d.ts.map