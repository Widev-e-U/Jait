export interface WorkspaceFile {
    id: string;
    name: string;
    path: string;
    content: string;
    language: string;
}
interface WorkspacePanelProps {
    /** Files that were added externally (drag-drop, tool calls, etc.) */
    files: WorkspaceFile[];
    activeFileId: string | null;
    onActiveFileChange: (id: string) => void;
    onFileDrop: (files: FileList | File[]) => void;
    onReferenceFile: (file: WorkspaceFile) => void;
    /** Called whenever the set of browsable files changes (for @ mention) */
    onAvailableFilesChange?: (files: {
        path: string;
        name: string;
    }[]) => void;
    /** When set, automatically open a remote (server-backed) workspace at this path */
    autoOpenRemotePath?: string | null;
    /** Surface ID for the active workspace (ensures REST calls target the right surface) */
    surfaceId?: string | null;
    /** Mobile mode — renders stacked tabs instead of side-by-side panes */
    isMobile?: boolean;
    /** Control visibility of the directory tree pane (default: true) */
    showTree?: boolean;
    /** Control visibility of the file/editor pane (default: true) */
    showEditor?: boolean;
    /** Called when user hides the tree pane from within the panel */
    onToggleTree?: () => void;
    /** Called when user hides the editor pane from within the panel */
    onToggleEditor?: () => void;
    /** Absolute paths of files recently changed by an agent (used to auto-refresh the editor) */
    changedPaths?: string[];
}
export interface WorkspacePanelHandle {
    /** Scan a local directory. If a handle is provided, use it directly; otherwise prompt the user. */
    openDirectory: (handle?: FileSystemDirectoryHandle) => Promise<void>;
    /** Open a remote (server-side) workspace by root path. Uses /api/workspace/* endpoints. */
    openRemoteWorkspace: (rootPath: string) => Promise<void>;
    /** Read a file from the lazy tree by path and return a WorkspaceFile, or null. */
    readFileByPath: (path: string) => Promise<WorkspaceFile | null>;
    /** Lazily search the entire directory for files matching a query. Cancellable via AbortSignal. */
    searchFiles: (query: string, limit: number, signal?: AbortSignal) => Promise<{
        path: string;
        name: string;
    }[]>;
}
export declare function workspaceLanguageForPath(path: string): string;
export declare const WorkspacePanel: import("react").ForwardRefExoticComponent<WorkspacePanelProps & import("react").RefAttributes<WorkspacePanelHandle>>;
export {};
//# sourceMappingURL=workspace-panel.d.ts.map