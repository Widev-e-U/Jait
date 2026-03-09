/**
 * Shared helper — resolve the FileSystemSurface for the current session.
 *
 * Priority:
 * 1. If `targetPath` is absolute and outside the current workspace boundary,
 *    find or create a surface scoped to contain that path.
 * 2. Look for an existing surface with the conventional ID `fs-{sessionId}`
 *    that is running (the auto-created surface for the session).
 * 3. Look for *any* running filesystem surface belonging to the session
 *    (e.g. one started via `surfaces.start` with a custom workspace root).
 * 4. If nothing exists, auto-start one with `context.workspaceRoot`.
 *
 * This ensures that when the user asks to read/edit files anywhere on their
 * local filesystem, the agent can access them without "escapes workspace
 * boundary" errors — while still maintaining PathGuard isolation per surface.
 */
import type { ToolContext } from "../contracts.js";
import type { SurfaceRegistry } from "../../surfaces/registry.js";
import { FileSystemSurface } from "../../surfaces/filesystem.js";
export declare function getFs(registry: SurfaceRegistry, context: ToolContext, targetPath?: string): Promise<FileSystemSurface>;
/**
 * Resolve the effective workspace root for a session.
 *
 * Prefers the most specific (deepest) workspace root among all running
 * filesystem surfaces for this session — avoids returning a broad drive root
 * when a more specific workspace surface exists.
 * Falls back to `process.cwd()`.
 */
export declare function resolveWorkspaceRoot(registry: SurfaceRegistry, sessionId: string, 
/** Optional fallback from session record before falling back to process.cwd() */
sessionWorkspacePath?: string | null): string;
//# sourceMappingURL=get-fs.d.ts.map