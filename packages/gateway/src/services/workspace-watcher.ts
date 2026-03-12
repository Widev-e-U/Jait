/**
 * WorkspaceWatcher — native recursive file system watching, inspired by VS Code's
 * @parcel/watcher integration (src/vs/platform/files/node/watcher/parcel/parcelWatcher.ts).
 *
 * Uses @parcel/watcher for OS-native events (FSEvents on macOS, inotify on Linux,
 * ReadDirectoryChangesW on Windows) with event coalescing and throttled emission
 * so that burst writes (e.g. `git checkout`, `npm install`) don't flood clients.
 */

import type { AsyncSubscription, Event as ParcelEvent } from "@parcel/watcher";
import { relative, sep } from "node:path";
import { EventEmitter } from "node:events";

// ── Types ────────────────────────────────────────────────────────────

export type FileChangeType = "created" | "updated" | "deleted";

export interface FileChangeEvent {
  /** Workspace-relative path (forward slashes) */
  path: string;
  type: FileChangeType;
}

export interface WorkspaceWatcherOptions {
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
}

// ── Default ignore list ──────────────────────────────────────────────
const DEFAULT_IGNORE = [
  "**/.git/**",
  "**/node_modules/**",
  "**/dist/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/build/**",
  "**/.cache/**",
  "**/.parcel-cache/**",
  "**/__pycache__/**",
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
    const key = event.path.toLowerCase();
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

export class WorkspaceWatcher extends EventEmitter {
  private subscription: AsyncSubscription | null = null;
  private buffer: FileChangeEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private _root: string | null = null;
  private options: Required<WorkspaceWatcherOptions>;

  constructor(opts?: WorkspaceWatcherOptions) {
    super();
    this.options = {
      ignore: opts?.ignore ?? DEFAULT_IGNORE,
      coalesceMs: opts?.coalesceMs ?? 150,
      maxBatchSize: opts?.maxBatchSize ?? 500,
    };
  }

  get root(): string | null {
    return this._root;
  }

  get watching(): boolean {
    return this.subscription !== null;
  }

  /**
   * Start watching a workspace root directory.
   * Stops any previous watcher first.
   */
  async watch(workspaceRoot: string): Promise<void> {
    await this.stop();
    this._root = workspaceRoot;

    // Dynamic import so the native module is only loaded when actually needed
    const parcel = await import("@parcel/watcher");
    this.subscription = await parcel.subscribe(
      workspaceRoot,
      (err, events) => {
        if (err) {
          this.emit("error", err);
          return;
        }
        this.handleRawEvents(events);
      },
      { ignore: this.options.ignore },
    );
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
