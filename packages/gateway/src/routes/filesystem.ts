/**
 * Filesystem Browse Routes — browse local or remote filesystems.
 *
 * These endpoints let any client explore directories on the gateway machine
 * or on remote filesystem nodes (Electron apps, phones, etc.) via WS proxy.
 * Used by the folder-picker dialog so users can choose a workspace root
 * from any device on the network.
 */

import type { FastifyInstance } from "fastify";
import { readdir, stat } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { homedir, hostname, platform } from "node:os";
import type { WsControlPlane } from "../ws.js";
import type { FsBrowseEntry, FsNode } from "@jait/shared";

/** Directories to hide from the browse listing */
const HIDDEN = new Set([
  "$RECYCLE.BIN", "System Volume Information", "$WinREAgent",
  "DumpStack.log.tmp", "pagefile.sys", "hiberfil.sys", "swapfile.sys",
]);

// Re-export for backwards compat
export type BrowseEntry = FsBrowseEntry;

/** Detect gateway platform for FsNode */
function detectPlatform(): FsNode["platform"] {
  const p = platform();
  if (p === "win32") return "windows";
  if (p === "darwin") return "macos";
  if (p === "linux") return "linux";
  return "linux";
}

export function registerFilesystemRoutes(app: FastifyInstance, ws?: WsControlPlane) {

  // Register the gateway itself as a filesystem node
  const gatewayNodeId = "gateway";
  if (ws) {
    ws.registerGatewayFsNode({
      id: gatewayNodeId,
      name: `Gateway (${hostname()})`,
      platform: detectPlatform(),
      clientId: "gateway",
      isGateway: true,
      registeredAt: new Date().toISOString(),
    });
  }

  /**
   * GET /api/filesystem/nodes
   * List all available filesystem nodes (gateway + connected devices).
   */
  app.get("/api/filesystem/nodes", async () => {
    const nodes = ws ? ws.getFsNodes() : [];
    return { nodes };
  });

  /**
   * GET /api/filesystem/roots?nodeId=<optional>
   * Return the root drives / home dir. If nodeId is provided and not "gateway",
   * proxy the request to the remote node.
   */
  app.get("/api/filesystem/roots", async (req, reply) => {
    const { nodeId } = req.query as { nodeId?: string };

    // Remote node — proxy via WS
    if (nodeId && nodeId !== gatewayNodeId && ws) {
      try {
        const roots = await ws.proxyFsRoots(nodeId);
        return { roots };
      } catch (err) {
        return reply.status(502).send({
          error: "NODE_BROWSE_FAILED",
          message: err instanceof Error ? err.message : "Failed to browse remote node",
        });
      }
    }

    // Local gateway filesystem
    const home = homedir();
    const roots: FsBrowseEntry[] = [];

    if (process.platform === "win32") {
      const { execSync } = await import("node:child_process");
      try {
        const raw = execSync("wmic logicaldisk get name", { encoding: "utf-8" });
        const drives = raw
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => /^[A-Z]:$/i.test(l));
        for (const d of drives) {
          roots.push({ name: d, path: d + "\\", type: "dir" });
        }
      } catch {
        roots.push({ name: "C:", path: "C:\\", type: "dir" });
      }
    } else {
      roots.push({ name: "/", path: "/", type: "dir" });
    }

    roots.push({ name: "Home", path: home, type: "dir" });
    return { roots };
  });

  /**
   * GET /api/filesystem/browse?path=<dir>&nodeId=<optional>
   * List entries in a directory. If nodeId is a remote node, proxy via WS.
   */
  app.get("/api/filesystem/browse", async (req, reply) => {
    const { path: dirPath, nodeId } = req.query as { path?: string; nodeId?: string };

    // Remote node — proxy via WS
    if (nodeId && nodeId !== gatewayNodeId && ws) {
      try {
        const result = await ws.proxyFsBrowse(nodeId, dirPath || "~");
        return result;
      } catch (err) {
        return reply.status(502).send({
          error: "NODE_BROWSE_FAILED",
          message: err instanceof Error ? err.message : "Failed to browse remote node",
        });
      }
    }

    // Local gateway filesystem
    const target = dirPath || homedir();

    try {
      const resolved = resolve(target);
      const info = await stat(resolved);
      if (!info.isDirectory()) {
        return reply.status(400).send({ error: "NOT_A_DIRECTORY", message: "Path is not a directory" });
      }

      const raw = await readdir(resolved, { withFileTypes: true });
      const entries: FsBrowseEntry[] = [];

      for (const d of raw) {
        if (d.name.startsWith(".") || HIDDEN.has(d.name)) continue;
        if (d.isDirectory()) {
          entries.push({ name: d.name, path: join(resolved, d.name), type: "dir" });
        } else if (d.isFile()) {
          entries.push({ name: d.name, path: join(resolved, d.name), type: "file" });
        }
      }

      entries.sort((a, b) => {
        if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      return {
        path: resolved,
        parent: dirname(resolved) !== resolved ? dirname(resolved) : null,
        entries,
      };
    } catch (err) {
      return reply.status(400).send({
        error: "BROWSE_FAILED",
        message: err instanceof Error ? err.message : "Failed to browse directory",
      });
    }
  });
}
