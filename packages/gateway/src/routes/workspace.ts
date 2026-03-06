/**
 * Workspace Routes — REST API for server-side file browsing.
 *
 * Exposes the FileSystemSurface's list/read/stat operations
 * so the web UI can browse a remote workspace without needing
 * the browser's File System Access API.
 */

import type { FastifyInstance } from "fastify";
import type { SurfaceRegistry } from "../surfaces/index.js";
import { FileSystemSurface } from "../surfaces/filesystem.js";

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
}
