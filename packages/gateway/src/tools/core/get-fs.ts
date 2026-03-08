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

import { resolve, isAbsolute, dirname } from "node:path";
import { stat } from "node:fs/promises";
import type { ToolContext } from "../contracts.js";
import type { SurfaceRegistry } from "../../surfaces/registry.js";
import { FileSystemSurface } from "../../surfaces/filesystem.js";

/**
 * Given a `targetPath`, determine the correct workspace root.
 * If the path is a directory, use it directly.
 * If the path is a file, use its parent directory.
 * Falls back to the path itself if stat fails (e.g. doesn't exist yet).
 */
async function deriveWorkspaceRoot(targetPath: string): Promise<string> {
  const abs = resolve(targetPath);
  try {
    const info = await stat(abs);
    return info.isDirectory() ? abs : dirname(abs);
  } catch {
    // Path doesn't exist yet — use the parent directory
    return dirname(abs);
  }
}

/**
 * Check if `surface` can serve `targetPath` (i.e. the path is within
 * the surface's workspace boundary).
 */
function surfaceCovers(surface: FileSystemSurface, targetPath: string): boolean {
  return surface.isPathAllowed(targetPath);
}

/**
 * Among multiple surfaces that cover a path, prefer the most specific one
 * (deepest workspace root).
 */
function pickMostSpecific(surfaces: FileSystemSurface[], targetPath: string): FileSystemSurface | null {
  let best: FileSystemSurface | null = null;
  let bestLen = -1;
  for (const s of surfaces) {
    if (!surfaceCovers(s, targetPath)) continue;
    const root = s.snapshot().metadata?.workspaceRoot as string | undefined;
    const len = root?.length ?? 0;
    if (len > bestLen) {
      best = s;
      bestLen = len;
    }
  }
  return best;
}

export async function getFs(
  registry: SurfaceRegistry,
  context: ToolContext,
  targetPath?: string,
): Promise<FileSystemSurface> {
  const absTarget = targetPath ? resolve(context.workspaceRoot, targetPath) : undefined;

  // ── If target is absolute and we already have a surface that covers it, use it ──
  if (absTarget) {
    // Collect all running FS surfaces for this session
    const candidates: FileSystemSurface[] = [];
    const fsId = `fs-${context.sessionId}`;
    const conventional = registry.getSurface(fsId) as FileSystemSurface | undefined;
    if (conventional?.state === "running") candidates.push(conventional);
    for (const s of registry.getBySession(context.sessionId)) {
      if (s instanceof FileSystemSurface && s.state === "running" && s !== conventional) {
        candidates.push(s);
      }
    }

    // Pick the most specific surface that covers this path
    const best = pickMostSpecific(candidates, absTarget);
    if (best) return best;

    // No existing surface covers this path — create one scoped to the target
    if (isAbsolute(targetPath!)) {
      const newRoot = await deriveWorkspaceRoot(absTarget);
      const safeName = newRoot.replace(/[:\\\/]/g, "_").replace(/_+$/, "").toLowerCase();
      const surfaceId = `fs-${context.sessionId}-${safeName}`;
      const existing = registry.getSurface(surfaceId) as FileSystemSurface | undefined;
      if (existing?.state === "running") return existing;

      const started = await registry.startSurface("filesystem", surfaceId, {
        sessionId: context.sessionId,
        workspaceRoot: newRoot,
      });
      return started as FileSystemSurface;
    }
  }

  // ── Default: find or create the conventional session surface ──

  // 1. Conventional per-session ID
  const fsId = `fs-${context.sessionId}`;
  const conventional = registry.getSurface(fsId) as
    | FileSystemSurface
    | undefined;
  if (conventional && conventional.state === "running") return conventional;

  // 2. Any running filesystem surface for this session
  const sessionSurfaces = registry.getBySession(context.sessionId);
  for (const s of sessionSurfaces) {
    if (
      s instanceof FileSystemSurface &&
      s.state === "running"
    ) {
      return s;
    }
  }

  // 3. Nothing found — auto-start one
  const started = await registry.startSurface("filesystem", fsId, {
    sessionId: context.sessionId,
    workspaceRoot: context.workspaceRoot,
  });
  return started as FileSystemSurface;
}

/**
 * Resolve the effective workspace root for a session.
 *
 * Prefers the most specific (deepest) workspace root among all running
 * filesystem surfaces for this session — avoids returning a broad drive root
 * when a more specific workspace surface exists.
 * Falls back to `process.cwd()`.
 */
export function resolveWorkspaceRoot(
  registry: SurfaceRegistry,
  sessionId: string,
  /** Optional fallback from session record before falling back to process.cwd() */
  sessionWorkspacePath?: string | null,
): string {
  let best: string | null = null;
  let bestLen = -1;
  for (const s of registry.getBySession(sessionId)) {
    if (s instanceof FileSystemSurface && s.state === "running") {
      const root = (s.snapshot().metadata as Record<string, unknown>)
        ?.workspaceRoot as string | undefined;
      if (root && root.length > bestLen) {
        best = root;
        bestLen = root.length;
      }
    }
  }
  return best ?? sessionWorkspacePath?.trim() ?? process.cwd();
}
