/**
 * Path traversal guards — Sprint 3.9
 *
 * Enforces workspace boundary, blocks symlink escapes, and
 * checks against a configurable set of denied paths.
 */
export interface PathGuardOptions {
    /** Workspace root — all file ops are confined here */
    workspaceRoot: string;
    /** Extra denied paths (absolute or relative to workspace) */
    deniedPaths?: string[];
    /** Whether to resolve symlinks and verify they stay inside boundary */
    checkSymlinks?: boolean;
}
export declare class PathGuard {
    private readonly root;
    private readonly denied;
    private readonly checkSymlinks;
    constructor(opts: PathGuardOptions);
    /**
     * Validate that `target` is within the workspace boundary.
     * Returns the resolved absolute path if valid, throws otherwise.
     */
    validate(target: string): string;
    /**
     * Validate + resolve symlinks to ensure they don't escape.
     * Use for file.write / file.patch where the target might be a symlink.
     */
    validateWithSymlinkCheck(target: string): Promise<string>;
    /** Helper to check if a path is valid without throwing */
    isAllowed(target: string): boolean;
    get workspaceRoot(): string;
}
export declare class PathTraversalError extends Error {
    readonly path: string;
    readonly boundary: string;
    readonly code: "PATH_TRAVERSAL";
    constructor(message: string, path: string, boundary: string);
}
//# sourceMappingURL=path-guard.d.ts.map