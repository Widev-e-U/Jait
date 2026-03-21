/**
 * Workspace Routes — REST API for server-side file browsing.
 *
 * Exposes the FileSystemSurface's list/read/stat operations
 * so the web UI can browse a remote workspace without needing
 * the browser's File System Access API.
 */

import type { FastifyInstance } from "fastify";
import { exec } from "node:child_process";
import { platform } from "node:os";
import { relative } from "node:path";
import { promisify } from "node:util";
import type { SurfaceRegistry } from "../surfaces/index.js";
import { PathTraversalError } from "../security/path-guard.js";
import type { SessionStateService } from "../services/session-state.js";
import type { SessionService } from "../services/sessions.js";
import type { WorkspaceService } from "../services/workspaces.js";
import type { WorkspaceStateService } from "../services/workspace-state.js";
import { FileSystemSurface } from "../surfaces/filesystem.js";
import { RemoteFileSystemSurface } from "../surfaces/remote-filesystem.js";
import type { WsControlPlane } from "../ws.js";
import { uuidv7 } from "../db/uuidv7.js";

type AnyFsSurface = FileSystemSurface | RemoteFileSystemSurface;
const execAsync = promisify(exec);

async function runWorkspaceSearch(
  workspaceRoot: string,
  query: string,
  mode: "files" | "content",
  maxResults: number,
) {
  const isWin = platform() === "win32";
  const safeDir = workspaceRoot.replace(/"/g, '\\"');
  const safeQuery = query.replace(/"/g, '\\"');

  try {
    if (mode === "content") {
      let cmd: string;
      if (isWin) {
        cmd = `rg --no-heading --line-number --max-count ${maxResults} --ignore-case --fixed-strings -- "${safeQuery}" "${safeDir}" 2>nul`;
        cmd += ` || findstr /s /n /i /l /c:"${safeQuery}" "${safeDir}\\*" 2>nul`;
      } else {
        cmd = `rg --no-heading --line-number --max-count ${maxResults} --ignore-case --fixed-strings -- "${safeQuery}" "${safeDir}" 2>/dev/null`;
        cmd += ` || grep -rn -i -F --max-count=${maxResults} -- "${safeQuery}" "${safeDir}" 2>/dev/null`;
      }

      const { stdout } = await execAsync(cmd, { timeout: 15_000, maxBuffer: 2 * 1024 * 1024 });
      const lines = stdout.trim().split("\n").filter(Boolean).slice(0, maxResults);
      const matches = lines.map((line) => {
        const match = line.match(/^(.+?):(\d+):(.*)$/);
        if (!match) return null;
        const absPath = match[1]!;
        const relPath = relative(workspaceRoot, absPath).replace(/\\/g, "/");
        return { file: relPath, line: parseInt(match[2]!, 10), content: match[3]!.trim() };
      }).filter(Boolean);

      return { query, mode, matches };
    }

    const cleanedQuery = query.replace(/[*?[\]]/g, "").trim();
    if (!cleanedQuery) {
      return { query, mode, files: [] };
    }
    const safeFileQuery = cleanedQuery.replace(/"/g, '\\"');

    let cmd: string;
    if (isWin) {
      cmd = `(rg --files "${safeDir}" 2>nul | findstr /i /l "${safeFileQuery}") || (dir /s /b "${safeDir}" 2>nul | findstr /i /l "${safeFileQuery}")`;
    } else {
      cmd = `((rg --files "${safeDir}" 2>/dev/null | grep -iF -- "${safeFileQuery}") || (find "${safeDir}" -type f 2>/dev/null | grep -iF -- "${safeFileQuery}")) | head -n ${maxResults}`;
    }

    const { stdout } = await execAsync(cmd, { timeout: 15_000, maxBuffer: 2 * 1024 * 1024 });
    const files = stdout.trim().split("\n").filter(Boolean).slice(0, maxResults).map((absPath) => {
      const relPath = relative(workspaceRoot, absPath.trim()).replace(/\\/g, "/");
      const name = relPath.split("/").pop() || relPath;
      return { path: relPath, name };
    });

    return { query, mode, files };
  } catch (err: unknown) {
    const stderr = (err as { stderr?: string })?.stderr || "";
    if (stderr && !stderr.includes("No such file")) {
      throw new Error(stderr.slice(0, 200));
    }
    return mode === "content"
      ? { query, mode, matches: [] }
      : { query, mode, files: [] };
  }
}

/**
 * Find the first running filesystem surface, optionally filtering by ID.
 */
function findFsSurface(registry: SurfaceRegistry, surfaceId?: string): AnyFsSurface | null {
  if (surfaceId) {
    const s = registry.getSurface(surfaceId);
    if (s && (s instanceof FileSystemSurface || s instanceof RemoteFileSystemSurface) && s.state === "running") return s;
    return null;
  }
  // Find the first running filesystem surface
  for (const s of registry.listSurfaces()) {
    if ((s instanceof FileSystemSurface || s instanceof RemoteFileSystemSurface) && s.state === "running") return s;
  }
  return null;
}

function findFsSurfaceWithBackup(
  registry: SurfaceRegistry,
  filePath: string,
  preferredSurfaceId?: string,
): AnyFsSurface | null {
  const preferred = findFsSurface(registry, preferredSurfaceId);
  if (preferred?.hasBackup(filePath)) return preferred;

  for (const s of registry.listSurfaces()) {
    if (!((s instanceof FileSystemSurface || s instanceof RemoteFileSystemSurface) && s.state === "running")) continue;
    if (preferred && s.snapshot().id === preferred.snapshot().id) continue;
    if (s.hasBackup(filePath)) return s;
  }

  return preferred ?? null;
}

export function registerWorkspaceRoutes(
  app: FastifyInstance,
  surfaceRegistry: SurfaceRegistry,
  _sessionState?: SessionStateService,
  sessionService?: SessionService,
  ws?: WsControlPlane,
  workspaceService?: WorkspaceService,
  workspaceState?: WorkspaceStateService,
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
    const body = req.body as { path?: string; sessionId?: string; nodeId?: string } | null;
    const workspacePath = body?.path;
    const sessionId = body?.sessionId;
    const nodeId = body?.nodeId || "gateway";

    if (!workspacePath) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "path is required" });
    }
    if (!sessionId) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "sessionId is required" });
    }

    const isRemote = ws?.isRemoteNode(nodeId) ?? false;

    if (isRemote) {
      // Remote node — verify path exists via WS proxy
      try {
        const info = await ws!.proxyFsOp<{ isDirectory: boolean }>(nodeId, "stat", { path: workspacePath });
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
        const info = await stat(workspacePath);
        if (!info.isDirectory()) {
          return reply.status(400).send({ error: "NOT_A_DIRECTORY", message: "The specified path is not a directory" });
        }
      } catch {
        return reply.status(400).send({ error: "PATH_NOT_FOUND", message: "The specified path does not exist" });
      }
    }

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
          workspaceRoot: workspacePath,
          nodeId,
        });
      } else {
        await surfaceRegistry.startSurface("filesystem", surfaceId, {
          sessionId,
          workspaceRoot: workspacePath,
        });
      }
    } catch (err) {
      return reply.status(500).send({
        error: "SURFACE_START_FAILED",
        message: err instanceof Error ? err.message : "Failed to start filesystem surface",
      });
    }

    const session = sessionService?.getById(sessionId);
    if (session?.workspaceId && workspaceState) {
      workspaceState.set(session.workspaceId, { "workspace.panel": { open: true, remotePath: workspacePath, surfaceId, nodeId } });
    }

    try {
      sessionService?.update(sessionId, { workspacePath });
      if (session?.workspaceId) {
        workspaceService?.update(session.workspaceId, { rootPath: workspacePath, nodeId }, session.userId ?? undefined);
        workspaceService?.touch(session.workspaceId);
      }
    } catch { /* best effort */ }

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

  // POST /api/workspace/write — write a file while preserving undo backups
  app.post("/api/workspace/write", async (req, reply) => {
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
      return reply.status(404).send({ error: "NO_WORKSPACE", message: "No filesystem surface is running" });
    }

    try {
      await fs.write(filePath, content);
      return { ok: true, path: filePath };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to write file";
      const isValidationError = err instanceof PathTraversalError || (err instanceof Error && (
        message.includes("outside workspace root")
        || message.includes("refers to a symlink")
        || message.includes("must be relative")
        || message.includes("escapes workspace boundary")
        || message.includes("path traversal")
      ));
      return reply.status(isValidationError ? 400 : 500).send({
        error: isValidationError ? "VALIDATION_ERROR" : "WRITE_FAILED",
        message,
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

    const fs = findFsSurfaceWithBackup(surfaceRegistry, filePath, body?.surfaceId);
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
      const isValidationError = err instanceof PathTraversalError || (err instanceof Error && (
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

  // POST /api/workspace/delete — delete a file or directory
  app.post("/api/workspace/delete", async (req, reply) => {
    const body = req.body as { path?: string; surfaceId?: string; isDirectory?: boolean } | null;
    const targetPath = body?.path;
    if (!targetPath) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "path is required" });
    }

    const fs = findFsSurface(surfaceRegistry, body?.surfaceId);
    if (!fs) {
      return reply.status(404).send({ error: "NO_WORKSPACE", message: "No filesystem surface is running" });
    }
    if (!(fs instanceof FileSystemSurface)) {
      return reply.status(501).send({ error: "NOT_SUPPORTED", message: "File management not supported on remote workspaces yet" });
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

  // POST /api/workspace/rename — rename a file or directory
  app.post("/api/workspace/rename", async (req, reply) => {
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

    const fs = findFsSurface(surfaceRegistry, body?.surfaceId);
    if (!fs) {
      return reply.status(404).send({ error: "NO_WORKSPACE", message: "No filesystem surface is running" });
    }
    if (!(fs instanceof FileSystemSurface)) {
      return reply.status(501).send({ error: "NOT_SUPPORTED", message: "File management not supported on remote workspaces yet" });
    }

    try {
      const newPath = await fs.renameFile(targetPath, newName);
      return { ok: true, path: targetPath, newPath };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to rename";
      return reply.status(500).send({ error: "RENAME_FAILED", message });
    }
  });

  // POST /api/workspace/move — move a file or directory to a new parent
  app.post("/api/workspace/move", async (req, reply) => {
    const body = req.body as { srcPath?: string; destDir?: string; surfaceId?: string } | null;
    const srcPath = body?.srcPath;
    const destDir = body?.destDir;
    if (!srcPath || !destDir) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "srcPath and destDir are required" });
    }

    const fs = findFsSurface(surfaceRegistry, body?.surfaceId);
    if (!fs) {
      return reply.status(404).send({ error: "NO_WORKSPACE", message: "No filesystem surface is running" });
    }
    if (!(fs instanceof FileSystemSurface)) {
      return reply.status(501).send({ error: "NOT_SUPPORTED", message: "File management not supported on remote workspaces yet" });
    }

    try {
      const newPath = await fs.moveFile(srcPath, destDir);
      return { ok: true, srcPath, newPath };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to move";
      return reply.status(500).send({ error: "MOVE_FAILED", message });
    }
  });

  // POST /api/workspace/create-file — create a new empty file
  app.post("/api/workspace/create-file", async (req, reply) => {
    const body = req.body as { path?: string; content?: string; surfaceId?: string } | null;
    const filePath = body?.path;
    if (!filePath) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "path is required" });
    }

    const fs = findFsSurface(surfaceRegistry, body?.surfaceId);
    if (!fs) {
      return reply.status(404).send({ error: "NO_WORKSPACE", message: "No filesystem surface is running" });
    }
    if (!(fs instanceof FileSystemSurface)) {
      return reply.status(501).send({ error: "NOT_SUPPORTED", message: "File management not supported on remote workspaces yet" });
    }

    try {
      await fs.createFile(filePath, body?.content ?? "");
      return { ok: true, path: filePath };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create file";
      return reply.status(500).send({ error: "CREATE_FAILED", message });
    }
  });

  // POST /api/workspace/create-directory — create a new directory
  app.post("/api/workspace/create-directory", async (req, reply) => {
    const body = req.body as { path?: string; surfaceId?: string } | null;
    const dirPath = body?.path;
    if (!dirPath) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "path is required" });
    }

    const fs = findFsSurface(surfaceRegistry, body?.surfaceId);
    if (!fs) {
      return reply.status(404).send({ error: "NO_WORKSPACE", message: "No filesystem surface is running" });
    }
    if (!(fs instanceof FileSystemSurface)) {
      return reply.status(501).send({ error: "NOT_SUPPORTED", message: "File management not supported on remote workspaces yet" });
    }

    try {
      await fs.createDirectory(dirPath);
      return { ok: true, path: dirPath };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create directory";
      return reply.status(500).send({ error: "CREATE_DIR_FAILED", message });
    }
  });

  // GET /api/workspace/search?query=&mode=&limit=&surfaceId=
  // mode: "files" (filename search) | "content" (grep/ripgrep content search)
  app.get("/api/workspace/search", async (req, reply) => {
    const { query, mode = "files", limit: limitStr, surfaceId } = req.query as {
      query?: string; mode?: string; limit?: string; surfaceId?: string;
    };
    if (!query) {
      return reply.status(400).send({ error: "VALIDATION_ERROR", message: "query is required" });
    }
    const maxResults = Math.min(Math.max(parseInt(limitStr || "50", 10) || 50, 1), 200);

    const fs = findFsSurface(surfaceRegistry, surfaceId);
    if (!fs) {
      return reply.status(404).send({ error: "NO_WORKSPACE", message: "No filesystem surface is running" });
    }
    const snap = fs.snapshot();
    const workspaceRoot = (snap.metadata as Record<string, unknown>)?.workspaceRoot as string;
    if (!workspaceRoot) {
      return reply.status(400).send({ error: "NO_ROOT", message: "No workspace root configured" });
    }

    try {
      if (fs instanceof RemoteFileSystemSurface) {
        const nodeId = fs.nodeId ?? ((snap.metadata as Record<string, unknown>)?.nodeId as string | undefined);
        if (!nodeId || !ws) {
          return reply.status(501).send({ error: "NOT_SUPPORTED", message: "Workspace search is not available for this remote workspace" });
        }
        const result = await ws.proxyFsOp(nodeId, "search-workspace", {
          path: workspaceRoot,
          query,
          mode,
          limit: maxResults,
        }, 20_000);
        return result;
      }
      return await runWorkspaceSearch(workspaceRoot, query, mode === "content" ? "content" : "files", maxResults);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Search failed";
      return reply.status(500).send({ error: "SEARCH_FAILED", message });
    }
  });
}
