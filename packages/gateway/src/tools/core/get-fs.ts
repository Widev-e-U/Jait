/**
 * Shared helper — resolve the FileSystemSurface (local or remote) for the
 * current session.
 *
 * Priority:
 * 1. If the session has a running RemoteFileSystemSurface (project lives on
 *    another device, e.g. a Windows desktop while the gateway runs on
 *    Linux), route file ops to it. We never resolve a foreign-platform path
 *    against the gateway's local filesystem — that produced broken paths
 *    like `/home/jakob/E:\Zinsrechner/E:\Zinsrechner`.
 * 2. If `targetPath` is absolute and outside the current project boundary,
 *    find or create a local surface scoped to contain that path.
 * 3. Look for an existing surface with the conventional ID `fs-{sessionId}`
 *    that is running (the auto-created surface for the session).
 * 4. Look for *any* running filesystem surface belonging to the session
 *    (e.g. one started via `surfaces.start` with a custom project root).
 * 5. If nothing exists, auto-start one with `context.projectRoot`.
 *
 * This ensures that when the user asks to read/edit files anywhere on their
 * local filesystem, the agent can access them without "escapes project
 * boundary" errors — while still maintaining PathGuard isolation per surface.
 */

import { resolve, isAbsolute, dirname } from "node:path";
import { stat } from "node:fs/promises";
import type { ToolContext } from "../contracts.js";
import type { SurfaceRegistry } from "../../surfaces/registry.js";
import { FileSystemSurface } from "../../surfaces/filesystem.js";
import { RemoteFileSystemSurface } from "../../surfaces/remote-filesystem.js";

/** Union of local + remote filesystem surfaces. */
export type AnyFsSurface = FileSystemSurface | RemoteFileSystemSurface;

/**
 * Detect whether a path belongs to a *different* OS than the one the
 * gateway is running on (e.g. a Windows drive path `E:\...` while the
 * gateway runs on Linux). Such paths cannot be resolved locally and must
 * always be served by a remote node surface.
 */
function isForeignPlatformPath(targetPath: string): boolean {
  const isWindowsPath = /^[A-Za-z]:[\\/]/.test(targetPath);
  const gatewayIsWindows = process.platform === "win32";
  if (gatewayIsWindows) {
    // A POSIX-absolute path (`/home/...`) on a Windows gateway is foreign.
    return targetPath.startsWith("/") && !isWindowsPath;
  }
  return isWindowsPath;
}

/**
 * Given a `targetPath`, determine the correct project root.
 * If the path is a directory, use it directly.
 * If the path is a file, use its parent directory.
 * Falls back to the path itself if stat fails (e.g. doesn't exist yet).
 */
async function deriveProjectRoot(targetPath: string): Promise<string> {
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
 * the surface's project boundary).
 */
function surfaceCovers(surface: FileSystemSurface, targetPath: string): boolean {
  return surface.isPathAllowed(targetPath);
}

/**
 * Among multiple surfaces that cover a path, prefer the most specific one
 * (deepest project root).
 */
function pickMostSpecific(surfaces: FileSystemSurface[], targetPath: string): FileSystemSurface | null {
  let best: FileSystemSurface | null = null;
  let bestLen = -1;
  for (const s of surfaces) {
    if (!surfaceCovers(s, targetPath)) continue;
    const root = s.snapshot().metadata?.projectRoot as string | undefined;
    const len = root?.length ?? 0;
    if (len > bestLen) {
      best = s;
      bestLen = len;
    }
  }
  return best;
}

/** Get the project root of any filesystem surface (local or remote). */
function getSurfaceRoot(surface: AnyFsSurface): string | null {
  const meta = surface.snapshot().metadata as Record<string, unknown>;
  return (meta?.projectRoot as string | undefined) ?? null;
}

/** Normalize a path for cross-platform prefix comparison. */
function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/**
 * Check whether a surface (local or remote) covers `targetPath`.
 * Uses forward-slash-normalized, case-insensitive prefix matching so a
 * Windows surface root (`E:\Zinsrechner`) matches a Windows path.
 */
function coversAny(surface: AnyFsSurface, targetPath: string, normTarget = normalizePath(targetPath)): boolean {
  // Prefer the surface's own isPathAllowed when it returns true.
  try {
    if (surface.isPathAllowed(targetPath)) return true;
  } catch {
    // fall through to manual check
  }
  const root = getSurfaceRoot(surface);
  if (!root) return false;
  const normRoot = normalizePath(root);
  if (!normRoot) return false;
  return normTarget === normRoot || normTarget.startsWith(normRoot + "/");
}

/**
 * Among multiple surfaces (local or remote) that cover a path, prefer the
 * most specific one (deepest project root).
 */
function pickMostSpecificAny(surfaces: AnyFsSurface[], targetPath: string): AnyFsSurface | null {
  const normTarget = normalizePath(targetPath);
  let best: AnyFsSurface | null = null;
  let bestLen = -1;
  for (const s of surfaces) {
    if (!coversAny(s, targetPath, normTarget)) continue;
    const root = getSurfaceRoot(s);
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
): Promise<AnyFsSurface> {
  const fsId = `fs-${context.sessionId}`;

  // ── Prefer a running remote-filesystem surface for this session ──
  // When the project lives on a remote node (e.g. a Windows desktop while
  // the gateway runs on Linux), the session's surface is a
  // RemoteFileSystemSurface. Route file ops to it instead of resolving the
  // foreign path against the gateway's local filesystem.
  const remoteSurfaces = registry
    .getBySession(context.sessionId)
    .filter((s): s is RemoteFileSystemSurface => s instanceof RemoteFileSystemSurface && s.state === "running");
  if (remoteSurfaces.length > 0) {
    if (targetPath) {
      const covered = pickMostSpecificAny(remoteSurfaces, targetPath);
      if (covered) return covered;
    }
    const conventionalRemote = remoteSurfaces.find((s) => s.id === fsId);
    return conventionalRemote ?? remoteSurfaces[0]!;
  }

  // ── Foreign-platform path with no remote surface ──
  // The target path belongs to a different OS than the gateway and there is
  // no remote node surface available. Do NOT try to resolve it locally —
  // that would create a bogus local surface and throw ENOENT.
  if (targetPath && isForeignPlatformPath(targetPath)) {
    throw new Error(
      `Path "${targetPath}" belongs to a different platform than the gateway ` +
        `(${process.platform}) and no remote node surface is available for this session. ` +
        `Open the project on its device first via /api/project/open.`,
    );
  }

  // ── Local filesystem surfaces ──
  const absTarget = targetPath ? resolve(context.projectRoot, targetPath) : undefined;

  if (absTarget) {
    const candidates: FileSystemSurface[] = [];
    const conventional = registry.getSurface(fsId) as FileSystemSurface | undefined;
    if (conventional?.state === "running") candidates.push(conventional);
    for (const s of registry.getBySession(context.sessionId)) {
      if (s instanceof FileSystemSurface && s.state === "running" && s !== conventional) {
        candidates.push(s);
      }
    }

    const best = pickMostSpecific(candidates, absTarget);
    if (best) return best;

    if (isAbsolute(targetPath!)) {
      const newRoot = await deriveProjectRoot(absTarget);
      const safeName = newRoot.replace(/[:\\/]/g, "_").replace(/_+$/, "").toLowerCase();
      const surfaceId = `fs-${context.sessionId}-${safeName}`;
      const existing = registry.getSurface(surfaceId) as FileSystemSurface | undefined;
      if (existing?.state === "running") return existing;

      const started = await registry.startSurface("filesystem", surfaceId, {
        sessionId: context.sessionId,
        projectRoot: newRoot,
      });
      return started as FileSystemSurface;
    }
  }

  // ── Default: find or create the conventional session surface ──
  const conventional = registry.getSurface(fsId) as FileSystemSurface | undefined;
  if (conventional && conventional.state === "running") return conventional;

  const sessionSurfaces = registry.getBySession(context.sessionId);
  for (const s of sessionSurfaces) {
    if (s instanceof FileSystemSurface && s.state === "running") {
      return s;
    }
  }

  const started = await registry.startSurface("filesystem", fsId, {
    sessionId: context.sessionId,
    projectRoot: context.projectRoot,
  });
  return started as FileSystemSurface;
}

/**
 * Resolve the effective project root for a session.
 *
 * Prefers the most specific (deepest) project root among all running
 * filesystem surfaces (local AND remote) for this session — avoids returning
 * a broad drive root when a more specific project surface exists.
 * Falls back to `process.cwd()`.
 */
export function resolveProjectRoot(
  registry: SurfaceRegistry,
  sessionId: string,
  /** Optional fallback from session record before falling back to process.cwd() */
  sessionProjectPath?: string | null,
): string {
  let best: string | null = null;
  let bestLen = -1;
  for (const s of registry.getBySession(sessionId)) {
    if (
      (s instanceof FileSystemSurface || s instanceof RemoteFileSystemSurface) &&
      s.state === "running"
    ) {
      const root = (s.snapshot().metadata as Record<string, unknown>)
        ?.projectRoot as string | undefined;
      if (root && root.length > bestLen) {
        best = root;
        bestLen = root.length;
      }
    }
  }
  return best ?? sessionProjectPath?.trim() ?? process.cwd();
}