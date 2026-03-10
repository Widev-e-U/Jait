/**
 * Remote File System Surface
 *
 * Proxies all filesystem operations (read, write, list, stat, etc.)
 * to a remote node (e.g. Electron desktop app) via the WS control plane.
 * This allows the gateway to work with files on any connected device,
 * not just its own local filesystem.
 */

import type {
  Surface,
  SurfaceStartInput,
  SurfaceStopInput,
  SurfaceSnapshot,
  SurfaceState,
  SurfaceFactory,
} from "./contracts.js";
import type { WsControlPlane } from "../ws.js";

export class RemoteFileSystemSurface implements Surface {
  readonly type = "remote-filesystem" as const;

  private _state: SurfaceState = "idle";
  private _sessionId: string | null = null;
  private _startedAt: string | null = null;
  private _workspaceRoot: string | null = null;
  private _nodeId: string | null = null;
  private _opCount = 0;

  /**
   * Backup map: file path → original content.
   * We store remote backups in memory on the gateway side so undo works.
   */
  private _backups = new Map<string, string | null>();

  onOutput?: (data: string) => void;
  onStateChange?: (state: SurfaceState) => void;

  constructor(
    public readonly id: string,
    private ws: WsControlPlane,
  ) {}

  get state(): SurfaceState {
    return this._state;
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  get nodeId(): string | null {
    return this._nodeId;
  }

  async start(input: SurfaceStartInput & { nodeId?: string }): Promise<void> {
    this._sessionId = input.sessionId;
    this._startedAt = new Date().toISOString();
    this._workspaceRoot = input.workspaceRoot;
    this._nodeId = input.nodeId ?? null;
    this._setState("running");
  }

  async stop(_input?: SurfaceStopInput): Promise<void> {
    this._setState("stopped");
  }

  snapshot(): SurfaceSnapshot {
    return {
      id: this.id,
      type: this.type,
      state: this._state,
      sessionId: this._sessionId ?? "",
      startedAt: this._startedAt ?? undefined,
      metadata: {
        workspaceRoot: this._workspaceRoot,
        nodeId: this._nodeId,
        operationCount: this._opCount,
        remote: true,
      },
    };
  }

  // ── File Operations (all proxied to remote node) ──────────────

  async read(filePath: string): Promise<string> {
    this.ensureRunning();
    this._opCount++;
    const result = await this.ws.proxyFsOp<{ content: string }>(
      this._nodeId!,
      "read",
      { path: filePath },
    );
    this.onOutput?.(`read ${filePath} (${result.content.length} bytes)`);
    return result.content;
  }

  async write(filePath: string, content: string): Promise<void> {
    this.ensureRunning();
    this._opCount++;

    // Save backup of original content (only on first modification)
    if (!this._backups.has(filePath)) {
      try {
        const original = await this.read(filePath);
        this._backups.set(filePath, original);
      } catch {
        // File didn't exist before — backup is null (undo = delete)
        this._backups.set(filePath, null);
      }
    }

    await this.ws.proxyFsOp(this._nodeId!, "write", { path: filePath, content });
    this.onOutput?.(`wrote ${filePath} (${content.length} bytes)`);
  }

  async patch(filePath: string, search: string, replace: string): Promise<{ matched: boolean }> {
    this.ensureRunning();
    this._opCount++;
    const original = await this.read(filePath);
    if (!original.includes(search)) {
      return { matched: false };
    }

    // Save backup before first modification
    if (!this._backups.has(filePath)) {
      this._backups.set(filePath, original);
    }

    const patched = original.replace(search, replace);
    await this.write(filePath, patched);
    this.onOutput?.(`patched ${filePath}`);
    return { matched: true };
  }

  async exists(filePath: string): Promise<boolean> {
    this.ensureRunning();
    try {
      const result = await this.ws.proxyFsOp<boolean>(this._nodeId!, "exists", { path: filePath });
      return result;
    } catch {
      return false;
    }
  }

  async list(dirPath: string): Promise<string[]> {
    this.ensureRunning();
    this._opCount++;
    const entries = await this.ws.proxyFsOp<string[]>(this._nodeId!, "list", { path: dirPath });
    return entries;
  }

  async statFile(filePath: string): Promise<{ size: number; isDirectory: boolean; modified: string }> {
    this.ensureRunning();
    return this.ws.proxyFsOp(this._nodeId!, "stat", { path: filePath });
  }

  /** Check if a path is within workspace boundary (basic check for remote paths) */
  isPathAllowed(filePath: string): boolean {
    if (!this._workspaceRoot) return false;
    // Normalize separators for cross-platform comparison
    const normRoot = this._workspaceRoot.replace(/\\/g, "/").toLowerCase();
    const normPath = filePath.replace(/\\/g, "/").toLowerCase();
    return normPath.startsWith(normRoot);
  }

  /**
   * Restore a file to its pre-modification state.
   */
  async restore(filePath: string): Promise<boolean> {
    this.ensureRunning();
    if (!this._backups.has(filePath)) return false;

    const backup = this._backups.get(filePath)!;
    if (backup === null) {
      // File was newly created — we can't easily delete remotely yet
      // For now, just clear the backup
    } else {
      await this.write(filePath, backup);
    }
    this._backups.delete(filePath);
    this.onOutput?.(`restored ${filePath}`);
    return true;
  }

  hasBackup(filePath: string): boolean {
    return this._backups.has(filePath);
  }

  getBackup(filePath: string): string | null | undefined {
    if (!this._backups.has(filePath)) return undefined;
    return this._backups.get(filePath) ?? null;
  }

  clearBackup(filePath: string): void {
    this._backups.delete(filePath);
  }

  async saveExternalBackup(filePath: string): Promise<void> {
    this.ensureRunning();
    if (this._backups.has(filePath)) return;
    try {
      const original = await this.read(filePath);
      this._backups.set(filePath, original);
    } catch {
      this._backups.set(filePath, null);
    }
  }

  private ensureRunning() {
    if (this._state !== "running") {
      throw new Error("Remote FileSystem surface is not running");
    }
    if (!this._nodeId) {
      throw new Error("Remote FileSystem surface has no nodeId");
    }
  }

  private _setState(s: SurfaceState) {
    this._state = s;
    this.onStateChange?.(s);
  }
}

export class RemoteFileSystemSurfaceFactory implements SurfaceFactory {
  readonly type = "remote-filesystem" as const;
  constructor(private ws: WsControlPlane) {}

  create(id: string): RemoteFileSystemSurface {
    return new RemoteFileSystemSurface(id, this.ws);
  }
}
