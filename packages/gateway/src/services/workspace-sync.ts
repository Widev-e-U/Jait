/**
 * Workspace Sync — pulls a remote workspace to a local temp directory
 * and pushes changed files back after a CLI provider (Codex/Claude) turn.
 *
 * This solves the fundamental problem: CLI providers operate directly on
 * the filesystem (not through Jait tools), so the workspace must exist
 * locally on the gateway. This service transparently mirrors a remote
 * node's workspace so CLI providers see a real local directory.
 *
 * Flow:
 *   1. pull()   — enumerate & download files from the remote node
 *   2. Codex/Claude runs against the local mirror
 *   3. push()   — detect changed files and upload them back
 *   4. cleanup() — remove the local mirror when done
 */

import { join } from "node:path";
import { homedir } from "node:os";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import type { WsControlPlane } from "../ws.js";

/** Directories/files to skip during sync to keep it fast */
const EXCLUDE_PATTERNS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".output",
  "__pycache__",
  ".venv",
  "venv",
  ".tox",
  "target",          // Rust/Java
  "vendor",          // Go/PHP
  ".gradle",
  ".idea",
  ".vs",
  "*.pyc",
  "*.pyo",
  ".DS_Store",
  "Thumbs.db",
];

/** Max file size to sync (skip large binaries) */
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

/** Max total files to sync (safety limit) */
const MAX_FILES = 5000;

/** Content hashes for change detection after a turn */
interface FileSnapshot {
  path: string;
  hash: string;
  size: number;
}

export interface WorkspaceSyncOptions {
  ws: WsControlPlane;
  nodeId: string;
  remotePath: string;
  sessionId: string;
}

export class WorkspaceSync {
  private ws: WsControlPlane;
  private nodeId: string;
  private remotePath: string;
  private localPath: string;
  private snapshot: Map<string, FileSnapshot> = new Map();
  private pulled = false;

  constructor(options: WorkspaceSyncOptions) {
    this.ws = options.ws;
    this.nodeId = options.nodeId;
    this.remotePath = options.remotePath;

    // Create a deterministic local path under ~/.jait/workspaces/
    const hash = createHash("sha256")
      .update(`${options.nodeId}:${options.remotePath}`)
      .digest("hex")
      .slice(0, 12);
    const dirName = options.remotePath
      .replace(/^[A-Za-z]:/, "")
      .replace(/[\\\/]/g, "_")
      .replace(/[^a-zA-Z0-9_.-]/g, "")
      .slice(0, 40);
    this.localPath = join(
      homedir(),
      ".jait",
      "workspaces",
      `${dirName}-${hash}`,
    );
  }

  /** The local directory path CLI providers should use as cwd */
  get localDir(): string {
    return this.localPath;
  }

  /** Whether the workspace has been pulled yet */
  get isPulled(): boolean {
    return this.pulled;
  }

  /**
   * Pull the workspace files from the remote node to the local mirror.
   * Recursively enumerates and downloads files, skipping excluded patterns.
   */
  async pull(): Promise<{ fileCount: number; totalSize: number }> {
    mkdirSync(this.localPath, { recursive: true });

    let fileCount = 0;
    let totalSize = 0;
    this.snapshot.clear();

    const enumerate = async (remoteDirPath: string, localDirPath: string): Promise<void> => {
      if (fileCount >= MAX_FILES) return;

      let entries: string[];
      try {
        entries = await this.ws.proxyFsOp<string[]>(
          this.nodeId,
          "list",
          { path: remoteDirPath },
          15_000,
        );
      } catch (err) {
        console.warn(`[workspace-sync] Failed to list ${remoteDirPath}: ${err}`);
        return;
      }

      for (const entry of entries) {
        if (fileCount >= MAX_FILES) break;

        const name = entry.endsWith("/") ? entry.slice(0, -1) : entry;
        const isDir = entry.endsWith("/");

        // Check excludes
        if (shouldExclude(name)) continue;

        const fullRemotePath = joinPath(remoteDirPath, name);
        const fullLocalPath = join(localDirPath, name);

        if (isDir) {
          mkdirSync(fullLocalPath, { recursive: true });
          await enumerate(fullRemotePath, fullLocalPath);
        } else {
          // Check file size before downloading
          try {
            const stat = await this.ws.proxyFsOp<{ size: number }>(
              this.nodeId,
              "stat",
              { path: fullRemotePath },
              10_000,
            );
            if (stat.size > MAX_FILE_SIZE) continue;
          } catch {
            continue;
          }

          // Download file content
          try {
            const result = await this.ws.proxyFsOp<{ content: string }>(
              this.nodeId,
              "read",
              { path: fullRemotePath },
              15_000,
            );

            mkdirSync(localDirPath, { recursive: true });
            writeFileSync(fullLocalPath, result.content, "utf-8");

            const hash = hashContent(result.content);
            const relPath = fullRemotePath.slice(this.remotePath.length).replace(/^[\\\/]/, "");
            this.snapshot.set(relPath, {
              path: relPath,
              hash,
              size: result.content.length,
            });

            fileCount++;
            totalSize += result.content.length;
          } catch (err) {
            // Skip files that can't be read (binary, permission errors, etc.)
            console.warn(`[workspace-sync] Skip ${fullRemotePath}: ${err}`);
          }
        }
      }
    };

    console.log(`[workspace-sync] Pulling ${this.remotePath} from node ${this.nodeId}...`);
    await enumerate(this.remotePath, this.localPath);
    this.pulled = true;
    console.log(`[workspace-sync] Pulled ${fileCount} files (${(totalSize / 1024).toFixed(1)} KB)`);

    return { fileCount, totalSize };
  }

  /**
   * Detect which files changed locally and push them back to the remote node.
   * Also handles new files and deleted files.
   */
  async push(): Promise<{ pushed: number; deleted: number }> {
    if (!this.pulled) return { pushed: 0, deleted: 0 };

    let pushed = 0;
    let deleted = 0;
    const seenRelPaths = new Set<string>();

    // Walk local directory for new/changed files
    const walkLocal = async (localDir: string, relDir: string): Promise<void> => {
      let entries: string[];
      try {
        entries = readdirSync(localDir);
      } catch {
        return;
      }

      for (const name of entries) {
        if (shouldExclude(name)) continue;
        const fullLocal = join(localDir, name);
        const relPath = relDir ? `${relDir}/${name}` : name;

        let stat;
        try {
          stat = statSync(fullLocal);
        } catch {
          continue;
        }

        if (stat.isDirectory()) {
          await walkLocal(fullLocal, relPath);
        } else if (stat.isFile()) {
          seenRelPaths.add(relPath);
          if (stat.size > MAX_FILE_SIZE) continue;

          try {
            const content = readFileSync(fullLocal, "utf-8");
            const hash = hashContent(content);
            const prev = this.snapshot.get(relPath);

            if (!prev || prev.hash !== hash) {
              // File is new or changed — push to remote
              const remotePath = joinPath(this.remotePath, relPath.replace(/\//g, getSep()));
              await this.ws.proxyFsOp(
                this.nodeId,
                "write",
                { path: remotePath, content },
                15_000,
              );
              pushed++;

              // Update snapshot
              this.snapshot.set(relPath, { path: relPath, hash, size: content.length });
            }
          } catch {
            // Skip files that can't be read (binary)
          }
        }
      }
    };

    await walkLocal(this.localPath, "");

    // Check for deleted files (in original snapshot but no longer on disk)
    for (const [relPath] of this.snapshot) {
      if (!seenRelPaths.has(relPath)) {
        // File was deleted locally — could delete on remote too, but for
        // safety we leave remote files intact. The CLI provider might have
        // intentionally deleted them and the user should verify.
        deleted++;
      }
    }

    if (pushed > 0 || deleted > 0) {
      console.log(`[workspace-sync] Pushed ${pushed} changed files, ${deleted} deleted`);
    }

    return { pushed, deleted };
  }

  /**
   * Clean up the local mirror directory.
   */
  async cleanup(): Promise<void> {
    try {
      if (existsSync(this.localPath)) {
        rmSync(this.localPath, { recursive: true, force: true });
        console.log(`[workspace-sync] Cleaned up ${this.localPath}`);
      }
    } catch (err) {
      console.warn(`[workspace-sync] Cleanup failed: ${err}`);
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function shouldExclude(name: string): boolean {
  for (const pattern of EXCLUDE_PATTERNS) {
    if (pattern.startsWith("*.")) {
      if (name.endsWith(pattern.slice(1))) return true;
    } else {
      if (name === pattern) return true;
    }
  }
  return false;
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/** Join two path segments using the remote's separator */
function joinPath(dir: string, name: string): string {
  const sep = dir.includes("\\") ? "\\" : "/";
  const trimmed = dir.endsWith(sep) ? dir.slice(0, -1) : dir;
  return `${trimmed}${sep}${name}`;
}

/** Get the path separator from the remote path style */
function getSep(): string {
  // Default to forward slash — the joinPath function in push()
  // converts back to remote style when constructing the remote path
  return "/";
}
