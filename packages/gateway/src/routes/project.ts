/**
 * Project Routes — REST API for server-side file browsing.
 *
 * Exposes the FileSystemSurface's list/read/stat operations
 * so the web UI can browse a remote project without needing
 * the browser's File System Access API.
 */

import { resolveProjectPanelOpen } from "@jait/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config.js";
import { execFile } from "node:child_process";
import { platform } from "node:os";
import { join, dirname } from "node:path";
import { promisify } from "node:util";
import type { SurfaceRegistry } from "../surfaces/index.js";
import { PathTraversalError } from "../security/path-guard.js";
import { requireAuth } from "../security/http-auth.js";
import type { SessionStateService } from "../services/session-state.js";
import type { SessionService } from "../services/sessions.js";
import type { ProjectService } from "../services/projects.js";
import type { ProjectStateService } from "../services/project-state.js";
import {
  normalizeProjectSearchLimit,
  projectSearchCandidateLimit,
  rankProjectContentMatches,
  rankProjectFilePaths,
  searchProject,
} from "../services/project-search.js";
import { FileSystemSurface } from "../surfaces/filesystem.js";
import { RemoteFileSystemSurface } from "../surfaces/remote-filesystem.js";
import type { WsControlPlane } from "../ws.js";
import { uuidv7 } from "../db/uuidv7.js";

type AnyFsSurface = FileSystemSurface | RemoteFileSystemSurface;
const execFileAsync = promisify(execFile);

/**
 * Find the first running filesystem surface, optionally filtering by ID.
 */
function findFsSurface(
  registry: SurfaceRegistry,
  surfaceId?: string,
  targetPath?: string,
  options?: { fallbackWhenTargetDisallowed?: boolean },
): AnyFsSurface | null {
  if (surfaceId) {
    const s = registry.getSurface(surfaceId);
    if (s && (s instanceof FileSystemSurface || s instanceof RemoteFileSystemSurface) && s.state === "running") {
      if (!targetPath || s.isPathAllowed(targetPath)) return s;
      if (!options?.fallbackWhenTargetDisallowed) return s;
    }
    if (!targetPath) return null;
  }
  if (targetPath) {
    for (const s of registry.listSurfaces()) {
      if (!((s instanceof FileSystemSurface || s instanceof RemoteFileSystemSurface) && s.state === "running")) continue;
      if (s.isPathAllowed(targetPath)) return s;
    }
    if (surfaceId) return null;
  }
  // Find the first running filesystem surface
  for (const s of registry.listSurfaces()) {
    if ((s instanceof FileSystemSurface || s instanceof RemoteFileSystemSurface) && s.state === "running") return s;
  }
  return null;
}

function findUserFsSurface(
  registry: SurfaceRegistry,
  sessionService: SessionService,
  userId: string,
  surfaceId?: string,
): AnyFsSurface | null {
  if (surfaceId) {
    const surface = findFsSurface(registry, surfaceId);
    if (!surface) return null;
    const sessionId = surface.snapshot().sessionId;
    return sessionId && sessionService.getById(sessionId, userId) ? surface : null;
  }

  for (const surface of registry.listSurfaces()) {
    if (!(
      (surface instanceof FileSystemSurface || surface instanceof RemoteFileSystemSurface)
      && surface.state === "running"
    )) continue;
    const sessionId = surface.snapshot().sessionId;
    if (sessionId && sessionService.getById(sessionId, userId)) return surface;
  }
  return null;
}

function findFsSurfaceWithBackup(
  registry: SurfaceRegistry,
  filePath: string,
  preferredSurfaceId?: string,
): AnyFsSurface | null {
  const preferred = findFsSurface(registry, preferredSurfaceId, filePath);
  if (preferred?.hasBackup(filePath)) return preferred;

  for (const s of registry.listSurfaces()) {
    if (!((s instanceof FileSystemSurface || s instanceof RemoteFileSystemSurface) && s.state === "running")) continue;
    if (preferred && s.snapshot().id === preferred.snapshot().id) continue;
    if (s.hasBackup(filePath)) return s;
  }

  return preferred ?? null;
}

// Serializes concurrent POST /api/project/open calls for the same session.
// Without this, two near-simultaneous requests (e.g. two restore effects
// firing on page load) both read the "existing surfaces" list before either
// has created its replacement, so both create a surface and neither sees
// the other's — leaving duplicate (and, for remote nodes, doubly-slow)
// filesystem surfaces running for the same session.
const projectOpenLocks = new Map<string, Promise<unknown>>();

function withProjectOpenLock<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  const prev = projectOpenLocks.get(sessionId) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  projectOpenLocks.set(sessionId, run.then(() => undefined, () => undefined));
  return run;
}

export function registerProjectRoutes(
  app: FastifyInstance,
  surfaceRegistry: SurfaceRegistry,
  sessionState?: SessionStateService,
  sessionService?: SessionService,
  ws?: WsControlPlane,
  projectService?: ProjectService,
  projectState?: ProjectStateService,
  config?: AppConfig,
) {
  // GET /api/project/info — returns the active project root + surface ID
  app.get("/api/project/info", async (_req, reply) => {
    const fs = findFsSurface(surfaceRegistry);
    if (!fs) {
      return reply.status(404).send({ error: "NO_PROJECT", message: "No filesystem surface is running" });
    }
    const snap = fs.snapshot();
    return {
      surfaceId: snap.id,
      projectRoot: (snap.metadata as Record<string, unknown>)?.projectRoot ?? null,
      state: snap.state,
    };
  });

  // POST /api/project/open — create a filesystem surface for the given path
  // This is called when a client picks a directory (e.g. Electron native dialog)
  // so that ALL clients on the session can browse files via the gateway REST API.
  app.post("/api/project/open", async (req, reply) => {
    const body = req.body as { path?: string; sessionId?: string; nodeId?: string; openPanel?: boolean } | null;
    const projectPath = body?.path;
    const sessionId = body?.sessionId;
    let nodeId = body?.nodeId || "gateway";

    if (!projectPath) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "path is required" });
    }
    if (!sessionId) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "sessionId is required" });
    }

    return withProjectOpenLock(sessionId, () => doProjectOpen(reply, projectPath, sessionId, nodeId, body?.openPanel));
  });

  async function doProjectOpen(
    reply: FastifyReply,
    projectPath: string,
    sessionId: string,
    nodeId: string,
    explicitPanelOpen?: boolean,
  ) {
    let isRemote = ws?.isRemoteNode(nodeId) ?? false;

    // If the requested nodeId looks like a remote node but is no longer connected,
    // try falling back to the gateway's local filesystem instead of failing.
    if (!isRemote && nodeId !== "gateway") {
      const { stat: fsStat } = await import("node:fs/promises");
      try {
        const info = await fsStat(projectPath);
        if (info.isDirectory()) {
          // Path exists locally — use gateway node instead of the stale remote one
          nodeId = "gateway";
        }
      } catch {
        return reply.status(400).send({
          error: "NODE_OFFLINE",
          message: `Remote node "${nodeId}" is no longer connected and the path does not exist on the gateway`,
        });
      }
    }

    if (isRemote) {
      // Remote node — verify path exists via WS proxy
      try {
        const info = await ws!.proxyFsOp<{ isDirectory: boolean }>(nodeId, "stat", { path: projectPath });
        if (!info.isDirectory) {
          return reply.status(400).send({ error: "NOT_A_DIRECTORY", message: "The specified path is not a directory" });
        }
      } catch {
        return reply.status(400).send({ error: "PATH_NOT_FOUND", message: "The specified path does not exist on the remote node" });
      }
    } else {
      // Local gateway — verify the path exists on the local filesystem
      const { stat } = await import("node:fs/promises");
      try {
        const info = await stat(projectPath);
        if (!info.isDirectory()) {
          return reply.status(400).send({ error: "NOT_A_DIRECTORY", message: "The specified path is not a directory" });
        }
      } catch {
        return reply.status(400).send({ error: "PATH_NOT_FOUND", message: "The specified path does not exist" });
      }
    }

    const existingProjectId = sessionService?.getById(sessionId)?.projectId ?? null;
    const existingProjectUI = existingProjectId && projectState
      ? projectState.get(existingProjectId, ["project.ui"])["project.ui"] as { panel?: { open?: boolean } | null } | null | undefined
      : null;
    const panelOpen = resolveProjectPanelOpen(explicitPanelOpen, existingProjectUI?.panel);

    // Stop any existing filesystem surface for this session
    const existing = surfaceRegistry.getBySession(sessionId)
      .filter((s) => (s instanceof FileSystemSurface || s instanceof RemoteFileSystemSurface) && s.state === "running");
    for (const s of existing) {
      await surfaceRegistry.stopSurface(s.snapshot().id, "replaced");
    }

    // Create a new filesystem surface (local or remote)
    const surfaceId = `filesystem-${uuidv7()}`;
    try {
      if (isRemote) {
        await surfaceRegistry.startSurface("remote-filesystem", surfaceId, {
          sessionId,
          projectRoot: projectPath,
          nodeId,
          panelOpen,
        });
      } else {
        await surfaceRegistry.startSurface("filesystem", surfaceId, {
          sessionId,
          projectRoot: projectPath,
          panelOpen,
        });
      }
    } catch (err) {
      return reply.status(500).send({
        error: "SURFACE_START_FAILED",
        message: err instanceof Error ? err.message : "Failed to start filesystem surface",
      });
    }

    const session = sessionService?.getById(sessionId);
    let projectId = session?.projectId ?? null;
    try {
      if (!projectId && session?.userId && projectService) {
        const project = projectService.getOrCreateForRoot({
          userId: session.userId,
          rootPath: projectPath,
          nodeId,
        });
        projectId = project.id;
        sessionService?.update(sessionId, { projectId, projectPath });
      } else {
        sessionService?.update(sessionId, { projectPath });
      }
      if (projectId) projectService?.touch(projectId);
    } catch { /* best effort */ }

    const panelState = { open: panelOpen, remotePath: projectPath, surfaceId, nodeId };
    if (sessionId && sessionState) {
      sessionState.set(sessionId, { "project.panel": panelState });
    }
    if (projectId && projectState) {
      const existing = projectState.get(projectId, ["project.ui"])["project.ui"] as {
        panel?: unknown;
        tabs?: unknown;
        layout?: unknown;
        terminal?: unknown;
        preview?: unknown;
      } | null | undefined;
      projectState.set(projectId, {
        "project.ui": {
          panel: panelState,
          tabs: existing?.tabs ?? null,
          layout: existing?.layout ?? null,
          terminal: existing?.terminal ?? null,
          preview: existing?.preview ?? null,
        },
      });
    }

    return { surfaceId, projectRoot: projectPath, nodeId, projectId, panelOpen };
  }

  // GET /api/project/list?path=&surfaceId= — list directory entries
  app.get("/api/project/list", async (req, reply) => {
    const { path: dirPath, surfaceId } = req.query as { path?: string; surfaceId?: string };
    const fs = findFsSurface(surfaceRegistry, surfaceId, dirPath, { fallbackWhenTargetDisallowed: true });
    if (!fs) {
      return reply.status(404).send({ error: "NO_PROJECT", message: "No filesystem surface is running" });
    }

    try {
      const snap = fs.snapshot();
      const root = (snap.metadata as Record<string, unknown>)?.projectRoot as string;
      const targetPath = dirPath || root || ".";
      const entries = await fs.list(targetPath);
      return { path: targetPath, entries };
    } catch (err) {
      return reply.status(400).send({
        error: "LIST_FAILED",
        message: err instanceof Error ? err.message : "Failed to list directory",
      });
    }
  });

  // GET /api/project/read?path=&surfaceId= — read a file
  app.get("/api/project/read", async (req, reply) => {
    const { path: filePath, surfaceId } = req.query as { path?: string; surfaceId?: string };
    const fs = findFsSurface(surfaceRegistry, surfaceId, filePath, { fallbackWhenTargetDisallowed: true });
    if (!fs) {
      return reply.status(404).send({ error: "NO_PROJECT", message: "No filesystem surface is running" });
    }
    if (!filePath) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "path query parameter is required" });
    }

    try {
      const content = await fs.read(filePath);
      const stInfo = await fs.statFile(filePath);
      return { path: filePath, content, size: stInfo.size, modified: stInfo.modified };
    } catch (err) {
      return reply.status(400).send({
        error: "READ_FAILED",
        message: err instanceof Error ? err.message : "Failed to read file",
      });
    }
  });

  // POST /api/project/write — write a file while preserving undo backups
  app.post("/api/project/write", async (req, reply) => {
    const body = req.body as { path?: string; content?: string; surfaceId?: string } | null;
    const filePath = body?.path;
    const content = body?.content;
    if (!filePath) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "path is required" });
    }
    if (typeof content !== "string") {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "content must be a string" });
    }

    const fs = findFsSurfaceWithBackup(surfaceRegistry, filePath, body?.surfaceId);
    if (!fs) {
      return reply.status(404).send({ error: "NO_PROJECT", message: "No filesystem surface is running" });
    }

    try {
      await fs.write(filePath, content);
      return { ok: true, path: filePath };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to write file";
      const isValidationError = err instanceof PathTraversalError || (err instanceof Error && (
        message.includes("outside project root")
        || message.includes("refers to a symlink")
        || message.includes("must be relative")
        || message.includes("escapes project boundary")
        || message.includes("path traversal")
      ));
      return reply.status(isValidationError ? 400 : 500).send({
        error: isValidationError ? "VALIDATION_ERROR" : "WRITE_FAILED",
        message,
      });
    }
  });

  // GET /api/project/stat?path=&surfaceId= — stat a file or directory
  app.get("/api/project/stat", async (req, reply) => {
    const { path: targetPath, surfaceId } = req.query as { path?: string; surfaceId?: string };
    const fs = findFsSurface(surfaceRegistry, surfaceId, targetPath, { fallbackWhenTargetDisallowed: true });
    if (!fs) {
      return reply.status(404).send({ error: "NO_PROJECT", message: "No filesystem surface is running" });
    }
    if (!targetPath) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "path query parameter is required" });
    }

    try {
      const info = await fs.statFile(targetPath);
      return { path: targetPath, ...info };
    } catch (err) {
      return reply.status(400).send({
        error: "STAT_FAILED",
        message: err instanceof Error ? err.message : "Failed to stat path",
      });
    }
  });

  // POST /api/project/undo — restore a file to its pre-modification state
  app.post("/api/project/undo", async (req, reply) => {
    const body = req.body as { path?: string; surfaceId?: string } | null;
    const filePath = body?.path;
    if (!filePath) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "path is required" });
    }

    const fs = findFsSurfaceWithBackup(surfaceRegistry, filePath, body?.surfaceId);
    if (!fs) {
      return reply.status(404).send({ error: "NO_PROJECT", message: "No filesystem surface is running" });
    }

    try {
      const restored = await fs.restore(filePath);
      if (!restored) {
        return reply.status(404).send({ error: "NO_BACKUP", message: "No backup found for this file" });
      }
      return { ok: true, path: filePath };
    } catch (err) {
      return reply.status(500).send({
        error: "UNDO_FAILED",
        message: err instanceof Error ? err.message : "Failed to undo file change",
      });
    }
  });

  // GET /api/project/backup?path= — get the original (backed-up) content of a file
  app.get("/api/project/backup", async (req, reply) => {
    const { path: filePath, surfaceId } = req.query as { path?: string; surfaceId?: string };
    const fs = findFsSurface(surfaceRegistry, surfaceId, filePath, { fallbackWhenTargetDisallowed: true });
    if (!fs) {
      return reply.status(404).send({ error: "NO_PROJECT", message: "No filesystem surface is running" });
    }
    if (!filePath) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "path query parameter is required" });
    }

    const hasBackup = fs.hasBackup(filePath);
    if (!hasBackup) {
      return reply.status(404).send({ error: "NO_BACKUP", message: "No backup found for this file" });
    }

    const backup = fs.getBackup(filePath);
    // Also read the current content
    let currentContent: string;
    try {
      currentContent = await fs.read(filePath);
    } catch {
      currentContent = "";
    }

    return {
      path: filePath,
      originalContent: backup, // null if file was newly created
      currentContent,
      hasBackup: true,
    };
  });

  // POST /api/project/apply-diff — apply merged file content and clear backup
  app.post("/api/project/apply-diff", async (req, reply) => {
    const body = req.body as { path?: string; content?: string | null; surfaceId?: string } | null;
    const filePath = body?.path;
    const content = body?.content;
    if (!filePath) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "path is required" });
    }

    const fs = findFsSurface(surfaceRegistry, body?.surfaceId, filePath);
    if (!fs) {
      return reply.status(404).send({ error: "NO_PROJECT", message: "No filesystem surface is running" });
    }

    try {
      // If content is provided, write it through the surface to keep path validation
      // and backup behavior consistent with other file mutations.
      if (content !== undefined && content !== null) {
        await fs.write(filePath, content);
      }
      fs.clearBackup(filePath);
      return { ok: true, path: filePath };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to apply diff";
      const isValidationError = err instanceof PathTraversalError || (err instanceof Error && (
        message.includes("outside project root")
        || message.includes("refers to a symlink")
        || message.includes("must be relative")
        || message.includes("escapes project boundary")
        || message.includes("path traversal")
      ));
      return reply.status(isValidationError ? 400 : 500).send({
        error: isValidationError ? "VALIDATION_ERROR" : "APPLY_FAILED",
        message,
      });
    }
  });

  // POST /api/project/undo-all — restore all modified files to pre-modification state
  app.post("/api/project/undo-all", async (req, reply) => {
    const body = req.body as { paths?: string[]; surfaceId?: string } | null;
    const paths = body?.paths;
    if (!paths || paths.length === 0) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "paths array is required" });
    }

    const results: { path: string; restored: boolean }[] = [];
    for (const p of paths) {
      try {
        const fs = findFsSurfaceWithBackup(surfaceRegistry, p, body?.surfaceId);
        if (!fs) {
          results.push({ path: p, restored: false });
          continue;
        }
        const restored = await fs.restore(p);
        results.push({ path: p, restored });
      } catch {
        results.push({ path: p, restored: false });
      }
    }
    return { ok: true, results };
  });

  // POST /api/project/delete — delete a file or directory
  app.post("/api/project/delete", async (req, reply) => {
    const body = req.body as { path?: string; surfaceId?: string; isDirectory?: boolean } | null;
    const targetPath = body?.path;
    if (!targetPath) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "path is required" });
    }

    const fs = findFsSurface(surfaceRegistry, body?.surfaceId, targetPath);
    if (!fs) {
      return reply.status(404).send({ error: "NO_PROJECT", message: "No filesystem surface is running" });
    }
    if (!(fs instanceof FileSystemSurface)) {
      return reply.status(501).send({ error: "NOT_SUPPORTED", message: "File management not supported on remote projects yet" });
    }

    try {
      if (body?.isDirectory) {
        await fs.deleteDirectory(targetPath);
      } else {
        await fs.deleteFile(targetPath);
      }
      return { ok: true, path: targetPath };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete";
      return reply.status(500).send({ error: "DELETE_FAILED", message });
    }
  });

  // POST /api/project/rename — rename a file or directory
  app.post("/api/project/rename", async (req, reply) => {
    const body = req.body as { path?: string; newName?: string; surfaceId?: string } | null;
    const targetPath = body?.path;
    const newName = body?.newName;
    if (!targetPath || !newName) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "path and newName are required" });
    }
    // Validate newName doesn't contain path separators
    if (newName.includes("/") || newName.includes("\\")) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "newName must not contain path separators" });
    }

    const fs = findFsSurface(surfaceRegistry, body?.surfaceId, targetPath);
    if (!fs) {
      return reply.status(404).send({ error: "NO_PROJECT", message: "No filesystem surface is running" });
    }
    if (!(fs instanceof FileSystemSurface)) {
      return reply.status(501).send({ error: "NOT_SUPPORTED", message: "File management not supported on remote projects yet" });
    }

    try {
      const newPath = await fs.renameFile(targetPath, newName);
      return { ok: true, path: targetPath, newPath };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to rename";
      return reply.status(500).send({ error: "RENAME_FAILED", message });
    }
  });

  // POST /api/project/move — move a file or directory to a new parent
  app.post("/api/project/move", async (req, reply) => {
    const body = req.body as { srcPath?: string; destDir?: string; surfaceId?: string } | null;
    const srcPath = body?.srcPath;
    const destDir = body?.destDir;
    if (!srcPath || !destDir) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "srcPath and destDir are required" });
    }

    const fs = findFsSurface(surfaceRegistry, body?.surfaceId, srcPath);
    if (!fs) {
      return reply.status(404).send({ error: "NO_PROJECT", message: "No filesystem surface is running" });
    }
    if (!(fs instanceof FileSystemSurface)) {
      return reply.status(501).send({ error: "NOT_SUPPORTED", message: "File management not supported on remote projects yet" });
    }

    try {
      const newPath = await fs.moveFile(srcPath, destDir);
      return { ok: true, srcPath, newPath };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to move";
      return reply.status(500).send({ error: "MOVE_FAILED", message });
    }
  });

  // POST /api/project/create-file — create a new empty file
  app.post("/api/project/create-file", async (req, reply) => {
    const body = req.body as { path?: string; content?: string; surfaceId?: string } | null;
    const filePath = body?.path;
    if (!filePath) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "path is required" });
    }

    const fs = findFsSurface(surfaceRegistry, body?.surfaceId, filePath);
    if (!fs) {
      return reply.status(404).send({ error: "NO_PROJECT", message: "No filesystem surface is running" });
    }
    if (!(fs instanceof FileSystemSurface)) {
      return reply.status(501).send({ error: "NOT_SUPPORTED", message: "File management not supported on remote projects yet" });
    }

    try {
      await fs.createFile(filePath, body?.content ?? "");
      return { ok: true, path: filePath };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create file";
      return reply.status(500).send({ error: "CREATE_FAILED", message });
    }
  });

  // POST /api/project/create-directory — create a new directory
  app.post("/api/project/create-directory", async (req, reply) => {
    const body = req.body as { path?: string; surfaceId?: string } | null;
    const dirPath = body?.path;
    if (!dirPath) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "path is required" });
    }

    const fs = findFsSurface(surfaceRegistry, body?.surfaceId, dirPath);
    if (!fs) {
      return reply.status(404).send({ error: "NO_PROJECT", message: "No filesystem surface is running" });
    }
    if (!(fs instanceof FileSystemSurface)) {
      return reply.status(501).send({ error: "NOT_SUPPORTED", message: "File management not supported on remote projects yet" });
    }

    try {
      await fs.createDirectory(dirPath);
      return { ok: true, path: dirPath };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create directory";
      return reply.status(500).send({ error: "CREATE_DIR_FAILED", message });
    }
  });

  // POST /api/project/reveal — reveal a file/folder in the OS file explorer.
  // For local (gateway) surfaces this opens the platform file manager directly.
  // For remote surfaces the request is proxied to the owning node (Electron app)
  // which calls shell.showItemInFolder / shell.openPath.
  app.post("/api/project/reveal", async (req, reply) => {
    const body = req.body as { path?: string; surfaceId?: string } | null;
    const targetPath = body?.path;
    if (!targetPath) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "path is required" });
    }

    const fs = findFsSurface(surfaceRegistry, body?.surfaceId, targetPath);
    if (!fs) {
      return reply.status(404).send({ error: "NO_PROJECT", message: "No filesystem surface is running" });
    }
    const snap = fs.snapshot();
    const projectRoot = (snap.metadata as Record<string, unknown>)?.projectRoot as string | undefined;
    if (!projectRoot) {
      return reply.status(400).send({ error: "NO_ROOT", message: "No project root configured" });
    }

    try {
      if (fs instanceof RemoteFileSystemSurface) {
        const nodeId = fs.nodeId ?? ((snap.metadata as Record<string, unknown>)?.nodeId as string | undefined);
        if (!nodeId || !ws) {
          return reply.status(501).send({
            error: "NOT_SUPPORTED",
            message: "Reveal in file explorer is not available for this remote project",
          });
        }
        // The surface stores project-relative paths for remote nodes, but the
        // remote fs-op handler expects an absolute path. Reconstruct it.
        const absPath = targetPath.startsWith(projectRoot) ? targetPath : join(projectRoot, targetPath);
        const result = await ws.proxyFsOp<{ ok?: boolean }>(nodeId, "reveal-in-explorer", { path: absPath }, 10_000);
        return { ok: true, revealed: true, ...(result ?? {}) };
      }

      // Local gateway surface — resolve the absolute path and open it.
      const absPath = targetPath.startsWith(projectRoot) ? targetPath : join(projectRoot, targetPath);
      const isWin = platform() === "win32";
      const isMac = platform() === "darwin";
      if (isWin) {
        // `explorer /select,"path"` highlights a file; for a directory it opens it.
        await execFileAsync("explorer", ["/select,", absPath], { timeout: 5_000 });
      } else if (isMac) {
        // `open -R` reveals the file in Finder; for a directory it opens it.
        await execFileAsync("open", ["-R", absPath], { timeout: 5_000 });
      } else {
        // Linux: open the containing directory (xdg-open doesn't support selection).
        const { stat: fsStat } = await import("node:fs/promises");
        const info = await fsStat(absPath);
        const dirToOpen = info.isDirectory() ? absPath : dirname(absPath);
        await execFileAsync("xdg-open", [dirToOpen], { timeout: 5_000 });
      }
      return { ok: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to reveal path";
      return reply.status(500).send({ error: "REVEAL_FAILED", message });
    }
  });

  // GET /api/project/search?query=&mode=&limit=&surfaceId=
  // mode: "files" (filename search) | "content" (grep/ripgrep content search)
  app.get("/api/project/search", async (req, reply) => {
    let authenticatedUserId: string | null = null;
    if (config) {
      const authUser = await requireAuth(req, reply, config.jwtSecret);
      if (!authUser) return;
      authenticatedUserId = authUser.id;
    }
    const {
      query,
      mode = "files",
      limit: limitValue,
      surfaceId,
      includeIgnoredFiles,
    } = req.query as {
      query?: string;
      mode?: string;
      limit?: string;
      surfaceId?: string;
      includeIgnoredFiles?: string;
    };
    if (!query) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "query is required" });
    }
    if (mode !== "files" && mode !== "content") {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: 'mode must be "files" or "content"',
      });
    }

    let maxResults: number;
    try {
      maxResults = normalizeProjectSearchLimit(limitValue, 50);
    } catch (error) {
      return reply.status(400).send({
        error: "VALIDATION_ERROR",
        message: error instanceof Error ? error.message : "limit is invalid",
      });
    }
    const includeIgnored = includeIgnoredFiles === "true";

    if (authenticatedUserId && !sessionService) {
      return reply.status(503).send({
        error: "AUTHORIZATION_UNAVAILABLE",
        message: "Project search authorization is unavailable",
      });
    }
    const fs = authenticatedUserId
      ? findUserFsSurface(surfaceRegistry, sessionService!, authenticatedUserId, surfaceId)
      : findFsSurface(surfaceRegistry, surfaceId);
    if (!fs) {
      return reply.status(404).send({ error: "NO_PROJECT", message: "No filesystem surface is running" });
    }
    const snap = fs.snapshot();
    const projectRoot = (snap.metadata as Record<string, unknown>)?.projectRoot as string;
    if (!projectRoot) {
      return reply.status(400).send({ error: "NO_ROOT", message: "No project root configured" });
    }

    try {
      if (fs instanceof RemoteFileSystemSurface) {
        const nodeId = fs.nodeId ?? ((snap.metadata as Record<string, unknown>)?.nodeId as string | undefined);
        if (!nodeId || !ws) {
          return reply.status(501).send({ error: "NOT_SUPPORTED", message: "Project search is not available for this remote project" });
        }
        const remoteLimit = projectSearchCandidateLimit(maxResults);
        const remoteResult = await ws.proxyFsOp<{
          limited?: boolean;
          files?: Array<{ path: string; name?: string }>;
          matches?: Array<{ file: string; line: number; content: string }>;
        }>(nodeId, "search-project", {
          path: projectRoot,
          query,
          mode,
          limit: remoteLimit,
          includeIgnoredFiles: includeIgnored,
        }, 20_000);

        if (mode === "content") {
          const candidates = (remoteResult.matches ?? []).map((match) => ({
            relativePath: match.file.replace(/\\/g, "/"),
            line: match.line,
            content: match.content,
          }));
          const matches = rankProjectContentMatches(candidates, query, maxResults);
          return {
            query,
            mode,
            limited: Boolean(remoteResult.limited) || candidates.length > maxResults,
            matches: matches.map(({ relativePath, line, content }) => ({
              file: relativePath,
              line,
              content,
            })),
          };
        }

        const candidates = (remoteResult.files ?? []).map((file) =>
          file.path.replace(/\\/g, "/")
        );
        const files = rankProjectFilePaths(candidates, query, maxResults);
        return {
          query,
          mode,
          limited: Boolean(remoteResult.limited) || candidates.length > maxResults,
          files: files.map(({ relativePath }) => ({
            path: relativePath,
            name: relativePath.split("/").pop() || relativePath,
          })),
        };
      }

      const result = await searchProject({
        root: projectRoot,
        query,
        mode,
        limit: maxResults,
        includeIgnoredFiles: includeIgnored,
      });
      if (result.mode === "content") {
        return {
          query,
          mode,
          limited: result.limited,
          matches: result.matches.map(({ relativePath, line, content }) => ({
            file: relativePath,
            line,
            content,
          })),
        };
      }
      return {
        query,
        mode,
        limited: result.limited,
        files: result.files.map(({ relativePath, name }) => ({
          path: relativePath,
          name,
        })),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Search failed";
      return reply.status(500).send({ error: "SEARCH_FAILED", message });
    }
  });

}
