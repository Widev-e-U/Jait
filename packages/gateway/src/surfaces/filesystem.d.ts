/**
 * File System Surface — Sprint 3.4
 *
 * file.read, file.write, file.patch with path boundary enforcement
 * via PathGuard. Tracks operations for audit.
 */
import { type PathGuardOptions } from "../security/path-guard.js";
import type { Surface, SurfaceStartInput, SurfaceStopInput, SurfaceSnapshot, SurfaceState } from "./contracts.js";
export declare class FileSystemSurface implements Surface {
    readonly id: string;
    private guardOpts?;
    readonly type: "filesystem";
    private _state;
    private _sessionId;
    private _startedAt;
    private guard;
    private _opCount;
    /**
     * Backup map: absolute path → original file content.
     * Stored before the first write/patch so that undo can restore the original.
     * Only the *first* version is kept (subsequent edits don't overwrite the backup).
     */
    private _backups;
    onOutput?: (data: string) => void;
    onStateChange?: (state: SurfaceState) => void;
    constructor(id: string, guardOpts?: Partial<PathGuardOptions> | undefined);
    get state(): SurfaceState;
    get sessionId(): string | null;
    start(input: SurfaceStartInput): Promise<void>;
    stop(_input?: SurfaceStopInput): Promise<void>;
    snapshot(): SurfaceSnapshot;
    read(filePath: string): Promise<string>;
    write(filePath: string, content: string): Promise<void>;
    patch(filePath: string, search: string, replace: string): Promise<{
        matched: boolean;
    }>;
    exists(filePath: string): Promise<boolean>;
    list(dirPath: string): Promise<string[]>;
    statFile(filePath: string): Promise<{
        size: number;
        isDirectory: boolean;
        modified: string;
    }>;
    /** Check if a path is within workspace boundary */
    isPathAllowed(filePath: string): boolean;
    /**
     * Restore a file to its pre-modification state.
     * Returns true if a backup existed and was restored, false otherwise.
     */
    restore(filePath: string): Promise<boolean>;
    /** Check whether we have a backup for a given file path */
    hasBackup(filePath: string): boolean;
    /**
     * Get the backup (original) content for a file.
     * Returns the original string, null if the file was newly created, or undefined if no backup exists.
     */
    getBackup(filePath: string): string | null | undefined;
    /** Clear the backup for a file (e.g. after user accepts changes). */
    clearBackup(filePath: string): void;
    /**
     * Save a backup of the current file content for an external change.
     * Used when CLI providers (e.g. Codex) modify files directly, bypassing
     * the surface's own write/patch methods.
     * Only saves the *first* backup — won't overwrite existing entries.
     */
    saveExternalBackup(filePath: string): Promise<void>;
    private ensureRunning;
    private _setState;
}
export declare class FileSystemSurfaceFactory {
    private guardOpts?;
    readonly type: "filesystem";
    constructor(guardOpts?: Partial<PathGuardOptions> | undefined);
    create(id: string): FileSystemSurface;
}
//# sourceMappingURL=filesystem.d.ts.map