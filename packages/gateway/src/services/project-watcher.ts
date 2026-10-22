/**
 * ProjectWatcher — native recursive file system watching, inspired by VS Code's
 * @parcel/watcher integration (src/vs/platform/files/node/watcher/parcel/parcelWatcher.ts).
 *
 * Uses @parcel/watcher for OS-native events (FSEvents on macOS, inotify on Linux,
 * ReadDirectoryChangesW on Windows) with event coalescing and throttled emission
 * so that burst writes (e.g. `git checkout`, `npm install`) don't flood clients.
 */

import type { AsyncSubscription, Event as ParcelEvent } from "@parcel/watcher";
import { relative, resolve, sep } from "node:path";
import { EventEmitter } from "node:events";

// ── Types ────────────────────────────────────────────────────────────

export type FileChangeType = "created" | "updated" | "deleted";

export interface FileChangeEvent {
  /** Project-relative path (forward slashes) */
  path: string;
  type: FileChangeType;
}

export interface ProjectWatcherOptions {
  /**
   * Glob patterns to ignore.  Defaults include .git, node_modules, dist, etc.
   */
  ignore?: string[];
  /**
   * Coalesce window in ms — events are buffered and deduplicated within this
   * window before being emitted.  Default: 150 (VS Code uses 75 + 200 throttle).
   */
  coalesceMs?: number;
  /**
   * Maximum events per emission batch.  Prevents memory blow-up during
   * large operations.  Default: 500.
   */
  maxBatchSize?: number;
  /**
   * Watch a root that lives inside a generated tree (a `.jait` directory).
   *
   * The gateway refuses those roots by default because its own artifacts,
   * sandboxes and deploy workspaces hold far more directories than the kernel
   * watch table can hand out.  Callers that pass a small, purpose-built
   * scratch tree under `.jait` — contract harnesses, fixtures — can opt back
   * in and get a real subscription.
   */
  allowGeneratedRoot?: boolean;
}

// ── Default ignore list ──────────────────────────────────────────────
/**
 * Glob patterns that are never watched.
 *
 * Generated trees have to be excluded, not merely for noise: the watcher opens
 * one OS watch handle per directory, and the kernel budget is finite
 * (`fs.inotify.max_user_watches`, 524288 on a default Linux box). A single
 * generated directory tree can exceed that on its own, and the recursive scan
 * then never completes — it fails, retries and keeps re-reading the tree while
 * starving the process' file I/O.
 *
 * `**\/.jait/**` is the important one: the gateway writes its own artifacts
 * (git worktrees, agent evidence, parity runs, sandbox images, databases)
 * inside the project it watches, so an unpruned artifact directory is a
 * self-inflicted watch explosion.
 */
export const DEFAULT_IGNORE = [
  "**/.git/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/build/**",
  "**/.cache/**",
  "**/.parcel-cache/**",
  "**/__pycache__/**",
  // Gateway-owned state and generated build/test output.
  "**/.jait/**",
  "**/target/**",
  "**/.turbo/**",
  "**/.nx/**",
  "**/.angular/**",
  "**/.svelte-kit/**",
  "**/.gradle/**",
  "**/.terraform/**",
  "**/.venv/**",
  "**/coverage/**",
  "**/.pytest_cache/**",
  "**/.mypy_cache/**",
  "**/.ruff_cache/**",
  // Sandboxes include toolchain homes with large package caches.
  "**/.bun/**",
  "**/.cargo/**",
  "**/.rustup/**",
  "**/.npm/**",
  "**/.yarn/**",
  "**/.pnpm-store/**",
  "**/.gradle-docker/**",
  "**/.android/**",
  "**/site-packages/**",
  "**/.DS_Store",
  "**/Thumbs.db",
  "**/*.swp",
  "**/*.swo",
  "**/*~",
];

// ── Coalescer (simplified from VS Code's EventCoalescer) ─────────────
function coalesceEvents(events: FileChangeEvent[]): FileChangeEvent[] {
  const map = new Map<string, FileChangeEvent>();

  for (const event of events) {
    // Native watcher paths retain the filesystem's case semantics.
    const key = event.path;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, { ...event });
      continue;
    }

    // CREATE → DELETE = cancel both
    if (existing.type === "created" && event.type === "deleted") {
      map.delete(key);
      continue;
    }
    // DELETE → CREATE = UPDATE
    if (existing.type === "deleted" && event.type === "created") {
      existing.type = "updated";
      continue;
    }
    // CREATE → UPDATE = stay CREATE
    if (existing.type === "created" && event.type === "updated") {
      continue;
    }
    // Otherwise take the latest type
    existing.type = event.type;
  }

  return Array.from(map.values());
}

// ── Map parcel event types to ours ──────────────────────────────────
function mapParcelType(type: ParcelEvent["type"]): FileChangeType {
  switch (type) {
    case "create": return "created";
    case "update": return "updated";
    case "delete": return "deleted";
  }
}

// ── Service ──────────────────────────────────────────────────────────

export class ProjectWatcher extends EventEmitter {
  private subscription: AsyncSubscription | null = null;
  private buffer: FileChangeEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private _root: string | null = null;
  private options: Required<ProjectWatcherOptions>;

  constructor(opts?: ProjectWatcherOptions) {
    super();
    this.options = {
      ignore: opts?.ignore ?? DEFAULT_IGNORE,
      coalesceMs: opts?.coalesceMs ?? 150,
      maxBatchSize: opts?.maxBatchSize ?? 500,
      allowGeneratedRoot: opts?.allowGeneratedRoot ?? false,
    };
  }

  get root(): string | null {
    return this._root;
  }

  get watching(): boolean {
    return this.subscription !== null;
  }

  /**
   * Start watching a project root directory.
   * Stops any previous watcher first.
   */
  async watch(projectRoot: string): Promise<void> {
    await this.stop();
    // Ignore globs are relative to the watched root. If .jait is an ancestor,
    // its artifacts and sandbox caches would otherwise receive native watches.
    // Callers that deliberately watch a small generated scratch tree opt in.
    if (!this.options.allowGeneratedRoot && /[\\/]\.jait(?:[\\/]|$)/.test(resolve(projectRoot))) {
      this._root = null;
      return;
    }
    this._root = projectRoot;

    // Dynamic import so the native module is only loaded when actually needed
    const parcel = await import("@parcel/watcher");
    try {
      this.subscription = await parcel.subscribe(
        projectRoot,
        (err, events) => {
          if (err) {
            this.emit("error", err);
            return;
          }
          this.handleRawEvents(events);
        },
        { ignore: this.options.ignore },
      );
    } catch (err) {
      // The kernel reports a full watch table as ENOSPC / "No space left on
      // device", which reads like a full disk. Say what it actually means.
      const code = (err as NodeJS.ErrnoException | undefined)?.code;
      const message = err instanceof Error ? err.message : String(err);
      if (code === "ENOSPC" || /no space left on device/i.test(message)) {
        throw new Error(
          `Cannot watch ${projectRoot}: the OS ran out of file-watch descriptors. `
            + "Ignore or delete generated directories (see DEFAULT_IGNORE), or raise "
            + `fs.inotify.max_user_watches. Original error: ${message}`,
        );
      }
      throw err;
    }
  }

  /** Stop watching and flush any pending events. */
  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    // Flush remaining buffered events
    if (this.buffer.length > 0) {
      this.flush();
    }
    if (this.subscription) {
      await this.subscription.unsubscribe();
      this.subscription = null;
    }
    this._root = null;
  }

  // ── Internal ─────────────────────────────────────────────────────

  private handleRawEvents(events: ParcelEvent[]) {
    if (!this._root) return;

    for (const event of events) {
      const rel = relative(this._root, event.path).split(sep).join("/");
      if (!rel || rel.startsWith("..")) continue;
      this.buffer.push({ path: rel, type: mapParcelType(event.type) });
    }

    // Enforce max batch size — flush immediately if too many events
    if (this.buffer.length >= this.options.maxBatchSize) {
      if (this.flushTimer) {
        clearTimeout(this.flushTimer);
        this.flushTimer = null;
      }
      this.flush();
      return;
    }

    // Otherwise debounce
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush();
      }, this.options.coalesceMs);
    }
  }

  private flush() {
    if (this.buffer.length === 0) return;
    const coalesced = coalesceEvents(this.buffer);
    this.buffer = [];
    this.emit("changes", coalesced);
  }
}
