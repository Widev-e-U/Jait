/**
 * File System Surface — Sprint 3.4
 *
 * file.read, file.write, file.patch with path boundary enforcement
 * via PathGuard. Tracks operations for audit.
 */

import { readFile, writeFile, mkdir, stat, readdir } from "node:fs/promises";
import { dirname, relative } from "node:path";
import { PathGuard, type PathGuardOptions } from "../security/path-guard.js";
import type {
  Surface,
  SurfaceStartInput,
  SurfaceStopInput,
  SurfaceSnapshot,
  SurfaceState,
} from "./contracts.js";

export class FileSystemSurface implements Surface {
  readonly type = "filesystem" as const;

  private _state: SurfaceState = "idle";
  private _sessionId: string | null = null;
  private _startedAt: string | null = null;
  private guard: PathGuard | null = null;
  private _opCount = 0;

  onOutput?: (data: string) => void;
  onStateChange?: (state: SurfaceState) => void;

  constructor(
    public readonly id: string,
    private guardOpts?: Partial<PathGuardOptions>,
  ) {}

  get state(): SurfaceState {
    return this._state;
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  async start(input: SurfaceStartInput): Promise<void> {
    this._sessionId = input.sessionId;
    this._startedAt = new Date().toISOString();
    this.guard = new PathGuard({
      workspaceRoot: input.workspaceRoot,
      ...this.guardOpts,
    });
    this._setState("running");
  }

  async stop(_input?: SurfaceStopInput): Promise<void> {
    this._setState("stopped");
    this.guard = null;
  }

  snapshot(): SurfaceSnapshot {
    return {
      id: this.id,
      type: this.type,
      state: this._state,
      sessionId: this._sessionId ?? "",
      startedAt: this._startedAt ?? undefined,
      metadata: {
        workspaceRoot: this.guard?.workspaceRoot ?? null,
        operationCount: this._opCount,
      },
    };
  }

  // ── File Operations ────────────────────────────────────────────

  async read(filePath: string): Promise<string> {
    this.ensureRunning();
    const abs = await this.guard!.validateWithSymlinkCheck(filePath);
    this._opCount++;
    const content = await readFile(abs, "utf-8");
    this.onOutput?.(`read ${relative(this.guard!.workspaceRoot, abs)} (${content.length} bytes)`);
    return content;
  }

  async write(filePath: string, content: string): Promise<void> {
    this.ensureRunning();
    const abs = await this.guard!.validateWithSymlinkCheck(filePath);
    this._opCount++;

    // Ensure parent directory exists
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf-8");
    this.onOutput?.(`wrote ${relative(this.guard!.workspaceRoot, abs)} (${content.length} bytes)`);
  }

  async patch(filePath: string, search: string, replace: string): Promise<{ matched: boolean }> {
    this.ensureRunning();
    const abs = await this.guard!.validateWithSymlinkCheck(filePath);
    this._opCount++;

    const original = await readFile(abs, "utf-8");
    if (!original.includes(search)) {
      return { matched: false };
    }

    const patched = original.replace(search, replace);
    await writeFile(abs, patched, "utf-8");
    this.onOutput?.(`patched ${relative(this.guard!.workspaceRoot, abs)}`);
    return { matched: true };
  }

  async exists(filePath: string): Promise<boolean> {
    this.ensureRunning();
    const abs = this.guard!.validate(filePath);
    try {
      await stat(abs);
      return true;
    } catch {
      return false;
    }
  }

  async list(dirPath: string): Promise<string[]> {
    this.ensureRunning();
    const abs = this.guard!.validate(dirPath);
    this._opCount++;
    const entries = await readdir(abs, { withFileTypes: true });
    return entries.map((e) => (e.isDirectory() ? e.name + "/" : e.name));
  }

  async statFile(filePath: string): Promise<{ size: number; isDirectory: boolean; modified: string }> {
    this.ensureRunning();
    const abs = this.guard!.validate(filePath);
    const s = await stat(abs);
    return {
      size: s.size,
      isDirectory: s.isDirectory(),
      modified: s.mtime.toISOString(),
    };
  }

  /** Check if a path is within workspace boundary */
  isPathAllowed(filePath: string): boolean {
    return this.guard?.isAllowed(filePath) ?? false;
  }

  private ensureRunning() {
    if (this._state !== "running" || !this.guard) {
      throw new Error("FileSystem surface is not running");
    }
  }

  private _setState(s: SurfaceState) {
    this._state = s;
    this.onStateChange?.(s);
  }
}

export class FileSystemSurfaceFactory {
  readonly type = "filesystem" as const;
  constructor(private guardOpts?: Partial<PathGuardOptions>) {}

  create(id: string): FileSystemSurface {
    return new FileSystemSurface(id, this.guardOpts);
  }
}
