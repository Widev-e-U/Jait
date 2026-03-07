/**
 * Workspace Routes — REST API for server-side file browsing.
 *
 * Exposes the FileSystemSurface's list/read/stat operations
 * so the web UI can browse a remote workspace without needing
 * the browser's File System Access API.
 */

import type { FastifyInstance } from "fastify";
import type { SurfaceRegistry } from "../surfaces/index.js";
import type { SessionStateService } from "../services/session-state.js";
import { FileSystemSurface } from "../surfaces/filesystem.js";
import { uuidv7 } from "../lib/uuidv7.js";
import { PathTraversalError } from "../security/path-guard.js";

/**
 * Find the first running filesystem surface, optionally filtering by ID.
 */
function findFsSurface(registry: SurfaceRegistry, surfaceId?: string): FileSystemSurface | null {
  if (surfaceId) {
    const s = registry.getSurface(surfaceId);
    if (s && s instanceof FileSystemSurface && s.state === "running") return s;
    return null;
  }
  // Find the first running filesystem surface
  for (const s of registry.listSurfaces()) {
    if (s instanceof FileSystemSurface && s.state === "running") return s;
  }
  return null;
}

export function registerWorkspaceRoutes(
  app: FastifyInstance,
  surfaceRegistry: SurfaceRegistry,
  sessionState?: SessionStateService,
) {
  // GET /api/workspace/info — returns the active workspace root + surface ID
  app.get("/api/workspace/info", async (_req, reply) => {
    const fs = findFsSurface(surfaceRegistry);
    if (!fs) {
      return reply.status(404).send({ error: "NO_WORKSPACE", message: "No filesystem surface is running" });
    }
    const snap = fs.snapshot();
    return {
      surfaceId: snap.id,
      workspaceRoot: (snap.metadata as Record<string, unknown>)?.workspaceRoot ?? null,
      state: snap.state,
    };
  });

  // POST /api/workspace/open — create a filesystem surface for the given path
  // This is called when a client picks a directory (e.g. Electron native dialog)
  // so that ALL clients on the session can browse files via the gateway REST API.
  app.post("/api/workspace/open", async (req, reply) => {
    const body = req.body as { path?: string; sessionId?: string } | null;
    const workspacePath = body?.path;
    const sessionId = body?.sessionId;

    if (!workspacePath) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "path is required" });
    }
    if (!sessionId) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "sessionId is required" });
    }

    // Verify the path exists on the filesystem
    const { stat } = await import("node:fs/promises");
    try {
      const info = await stat(workspacePath);
      if (!info.isDirectory()) {
        return reply.status(400).send({ error: "NOT_A_DIRECTORY", message: "The specified path is not a directory" });
      }
    } catch {
      return reply.status(400).send({ error: "PATH_NOT_FOUND", message: "The specified path does not exist" });
    }

    // Stop any existing filesystem surface for this session
    const existing = surfaceRegistry.getBySession(sessionId)
      .filter((s) => s instanceof FileSystemSurface && s.state === "running");
    for (const s of existing) {
      await surfaceRegistry.stopSurface(s.snapshot().id, "replaced");
    }

    // Create a new filesystem surface
    const surfaceId = `filesystem-${uuidv7()}`;
    try {
      await surfaceRegistry.startSurface("filesystem", surfaceId, {
        sessionId,
        workspaceRoot: workspacePath,
      });
    } catch (err) {
      return reply.status(500).send({
        error: "SURFACE_START_FAILED",
        message: err instanceof Error ? err.message : "Failed to start filesystem surface",
      });
    }

    // Persist workspace state to session DB so late-joiners get it
    if (sessionState) {
      sessionState.set(sessionId, { "workspace.panel": { open: true, remotePath: workspacePath, surfaceId } });
    }

    return { surfaceId, workspaceRoot: workspacePath };
  });

  // GET /api/workspace/list?path=&surfaceId= — list directory entries
  app.get("/api/workspace/list", async (req, reply) => {
    const { path: dirPath, surfaceId } = req.query as { path?: string; surfaceId?: string };
    const fs = findFsSurface(surfaceRegistry, surfaceId);
    if (!fs) {
      return reply.status(404).send({ error: "NO_WORKSPACE", message: "No filesystem surface is running" });
    }

    try {
      const snap = fs.snapshot();
      const root = (snap.metadata as Record<string, unknown>)?.workspaceRoot as string;
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

  // GET /api/workspace/read?path=&surfaceId= — read a file
  app.get("/api/workspace/read", async (req, reply) => {
    const { path: filePath, surfaceId } = req.query as { path?: string; surfaceId?: string };
    const fs = findFsSurface(surfaceRegistry, surfaceId);
    if (!fs) {
      return reply.status(404).send({ error: "NO_WORKSPACE", message: "No filesystem surface is running" });
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

  // GET /api/workspace/stat?path=&surfaceId= — stat a file or directory
  app.get("/api/workspace/stat", async (req, reply) => {
    const { path: targetPath, surfaceId } = req.query as { path?: string; surfaceId?: string };
    const fs = findFsSurface(surfaceRegistry, surfaceId);
    if (!fs) {
      return reply.status(404).send({ error: "NO_WORKSPACE", message: "No filesystem surface is running" });
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

  // POST /api/workspace/undo — restore a file to its pre-modification state
  app.post("/api/workspace/undo", async (req, reply) => {
    const body = req.body as { path?: string; surfaceId?: string } | null;
    const filePath = body?.path;
    if (!filePath) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "path is required" });
    }

    const fs = findFsSurface(surfaceRegistry, body?.surfaceId);
    if (!fs) {
      return reply.status(404).send({ error: "NO_WORKSPACE", message: "No filesystem surface is running" });
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

  // GET /api/workspace/backup?path= — get the original (backed-up) content of a file
  app.get("/api/workspace/backup", async (req, reply) => {
    const { path: filePath, surfaceId } = req.query as { path?: string; surfaceId?: string };
    const fs = findFsSurface(surfaceRegistry, surfaceId);
    if (!fs) {
      return reply.status(404).send({ error: "NO_WORKSPACE", message: "No filesystem surface is running" });
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

  // POST /api/workspace/apply-diff — apply merged file content and clear backup
  app.post("/api/workspace/apply-diff", async (req, reply) => {
    const body = req.body as { path?: string; content?: string | null; surfaceId?: string } | null;
    const filePath = body?.path;
    const content = body?.content;
    if (!filePath) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "path is required" });
    }

    const fs = findFsSurface(surfaceRegistry, body?.surfaceId);
    if (!fs) {
      return reply.status(404).send({ error: "NO_WORKSPACE", message: "No filesystem surface is running" });
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
      const isValidationError = err instanceof PathTraversalError
        || (err instanceof Error && (
          message.includes("outside workspace root")
          || message.includes("refers to a symlink")
          || message.includes("must be relative")
          || message.includes("escapes workspace boundary")
          || message.includes("path traversal")
        ));
      return reply.status(isValidationError ? 400 : 500).send({
        error: isValidationError ? "VALIDATION_ERROR" : "APPLY_FAILED",
        message,
      });
    }
  });

  // POST /api/workspace/undo-all — restore all modified files to pre-modification state
  app.post("/api/workspace/undo-all", async (req, reply) => {
    const body = req.body as { paths?: string[]; surfaceId?: string } | null;
    const paths = body?.paths;
    if (!paths || paths.length === 0) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "paths array is required" });
    }

    const fs = findFsSurface(surfaceRegistry, body?.surfaceId);
    if (!fs) {
      return reply.status(404).send({ error: "NO_WORKSPACE", message: "No filesystem surface is running" });
    }

    const results: { path: string; restored: boolean }[] = [];
    for (const p of paths) {
      try {
        const restored = await fs.restore(p);
        results.push({ path: p, restored });
      } catch {
        results.push({ path: p, restored: false });
      }
    }
    return { ok: true, results };
  });
}
