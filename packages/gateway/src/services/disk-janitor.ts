/**
 * DiskJanitor — reclaims disk that Jait allocates but never frees.
 *
 * Three sources of unbounded growth exist outside the SQLite retention path:
 *
 *   1. Managed git worktrees (`~/.jait/worktrees/<repo>/<dir>`) are created per
 *      delivery thread but only removed when the user explicitly deletes the
 *      thread or a PR merges. Threads that complete, error out, or get dropped
 *      from the database leave a full checkout (plus `node_modules`) behind.
 *   2. Windows sandbox VM disks under the sandbox storage root survive whenever
 *      the gateway dies before `stopWindowsSandbox` runs.
 *   3. Scratch directories the tools create under the OS temp dir (`jait-*`).
 *
 * The janitor runs on an interval and on startup. It is deliberately
 * conservative: it only ever touches paths inside a known managed root, never
 * removes a worktree belonging to a running thread, and preserves git branches
 * by default so committed work stays recoverable from the main repo.
 */

import { existsSync, type Dirent } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import type { SqliteDatabase } from "../db/index.js";
import { GitService } from "./git.js";

const MINUTE_MS = 60 * 1_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Thread states that mean "this worktree will not be written to again". */
const TERMINAL_THREAD_STATUSES = ["completed", "error", "interrupted"] as const;

export interface DiskJanitorPolicy {
  enabled: boolean;
  /** Reap worktrees whose thread reached a terminal state this long ago. */
  worktreeGraceMs: number;
  /** Reap worktrees with no matching thread row after this long. */
  orphanWorktreeGraceMs: number;
  /** Keep the git branch when reaping, so committed work stays recoverable. */
  preserveBranches: boolean;
  /** Reap `jait-*` scratch entries in the OS temp dir older than this. */
  tempScratchMaxAgeMs: number;
  /** Reap sandbox VM storage directories older than this. */
  sandboxStorageMaxAgeMs: number;
  initialDelayMs: number;
  intervalMs: number;
}

export interface ReapedEntry {
  path: string;
  bytes: number;
  reason: string;
}

export interface DiskJanitorReport {
  enabled: boolean;
  dryRun: boolean;
  worktrees: ReapedEntry[];
  tempScratch: ReapedEntry[];
  sandboxStorage: ReapedEntry[];
  bytesReclaimed: number;
  errors: string[];
  skippedReason?: "disabled" | "already-running" | "stopped";
}

export interface DiskJanitorRunOptions {
  dryRun?: boolean;
  now?: Date;
}

export interface DiskJanitorLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

const consoleLogger: DiskJanitorLogger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
  error: (message) => console.error(message),
};

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseDaysMs(value: string | undefined, fallbackMs: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed * DAY_MS : fallbackMs;
}

export function loadDiskJanitorPolicy(
  env: NodeJS.ProcessEnv = process.env,
): DiskJanitorPolicy {
  return {
    enabled: parseBoolean(env["JAIT_DISK_JANITOR_ENABLED"], true),
    worktreeGraceMs: parseDaysMs(env["JAIT_JANITOR_WORKTREE_GRACE_DAYS"], 2 * DAY_MS),
    orphanWorktreeGraceMs: parseDaysMs(env["JAIT_JANITOR_ORPHAN_WORKTREE_GRACE_DAYS"], DAY_MS),
    preserveBranches: parseBoolean(env["JAIT_JANITOR_PRESERVE_BRANCHES"], true),
    tempScratchMaxAgeMs: parseDaysMs(env["JAIT_JANITOR_TEMP_SCRATCH_DAYS"], 3 * DAY_MS),
    sandboxStorageMaxAgeMs: parseDaysMs(env["JAIT_JANITOR_SANDBOX_STORAGE_DAYS"], DAY_MS),
    initialDelayMs: parsePositiveInteger(env["JAIT_JANITOR_INITIAL_DELAY_MS"], 2 * MINUTE_MS),
    intervalMs: parsePositiveInteger(env["JAIT_JANITOR_INTERVAL_MS"], 6 * HOUR_MS),
  };
}

/** Root holding the per-repo managed worktree directories. */
export function managedWorktreeRoot(): string {
  return join(homedir(), ".jait", "worktrees");
}

/** Root holding Windows sandbox VM disks (mirrors sandbox-manager). */
export function sandboxStorageRoot(): string {
  return process.env["JAIT_WINDOWS_SANDBOX_STORAGE"] ?? join(tmpdir(), "jait-windows-sandbox");
}

/** Guard: refuse to delete anything that is not inside `root`. */
export function isInside(root: string, candidate: string): boolean {
  const resolvedRoot = resolve(root);
  const resolved = resolve(candidate);
  return resolved !== resolvedRoot && resolved.startsWith(`${resolvedRoot}${sep}`);
}

/** Recursive size of a directory. Best-effort; unreadable entries count as 0. */
export async function directorySize(path: string): Promise<number> {
  let total = 0;
  const walk = async (current: string): Promise<void> => {
    let entries: Dirent<string>[];
    try {
      entries = await readdir(current, { withFileTypes: true, encoding: "utf8" });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(child);
        continue;
      }
      try {
        const info = await stat(child);
        total += info.size;
      } catch { /* best effort */ }
    }
  };
  try {
    const info = await stat(path);
    if (!info.isDirectory()) return info.size;
  } catch {
    return 0;
  }
  await walk(path);
  return total;
}

interface ThreadLookupRow {
  status: string;
  branch: string | null;
  updatedAt: string;
}

/** Managed roots the janitor is allowed to delete inside. Overridable in tests. */
export interface DiskJanitorRoots {
  worktrees: string;
  sandboxStorage: string;
  temp: string;
}

export function defaultDiskJanitorRoots(): DiskJanitorRoots {
  return {
    worktrees: managedWorktreeRoot(),
    sandboxStorage: sandboxStorageRoot(),
    temp: tmpdir(),
  };
}

export class DiskJanitor {
  private running = false;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private sqlite: SqliteDatabase,
    readonly policy: DiskJanitorPolicy = loadDiskJanitorPolicy(),
    private logger: DiskJanitorLogger = consoleLogger,
    private git: Pick<GitService, "cleanupWorktreeWithOptions"> = new GitService(),
    private roots: DiskJanitorRoots = defaultDiskJanitorRoots(),
  ) {}

  /** Report what a run would remove, without touching disk. */
  async inspect(now = new Date()): Promise<DiskJanitorReport> {
    return this.execute({ dryRun: true, now });
  }

  /** Run one janitor pass. */
  async run(options: DiskJanitorRunOptions = {}): Promise<DiskJanitorReport> {
    if (!this.policy.enabled) return this.emptyReport(true, "disabled");
    if (this.stopped) return this.emptyReport(options.dryRun ?? false, "stopped");
    if (this.running) return this.emptyReport(options.dryRun ?? false, "already-running");

    this.running = true;
    try {
      return await this.execute(options);
    } finally {
      this.running = false;
    }
  }

  /** Start the periodic sweep. Safe to call once at boot. */
  start(): void {
    if (!this.policy.enabled || this.timer) return;
    this.stopped = false;
    const tick = async (): Promise<void> => {
      if (this.stopped) return;
      try {
        const report = await this.run();
        if (report.bytesReclaimed > 0) {
          const mb = (report.bytesReclaimed / (1024 * 1024)).toFixed(1);
          const count =
            report.worktrees.length + report.tempScratch.length + report.sandboxStorage.length;
          this.logger.info(`[disk-janitor] reclaimed ${mb} MB across ${count} entrie(s)`);
        }
      } catch (err) {
        this.logger.error(`[disk-janitor] run failed: ${String(err)}`);
      }
      if (this.stopped) return;
      this.timer = setTimeout(() => void tick(), this.policy.intervalMs);
      this.timer.unref?.();
    };
    this.timer = setTimeout(() => void tick(), this.policy.initialDelayMs);
    this.timer.unref?.();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // ── Internals ────────────────────────────────────────────────────

  private emptyReport(
    dryRun: boolean,
    skippedReason?: DiskJanitorReport["skippedReason"],
  ): DiskJanitorReport {
    return {
      enabled: this.policy.enabled,
      dryRun,
      worktrees: [],
      tempScratch: [],
      sandboxStorage: [],
      bytesReclaimed: 0,
      errors: [],
      skippedReason,
    };
  }

  private async execute(options: DiskJanitorRunOptions): Promise<DiskJanitorReport> {
    const dryRun = options.dryRun ?? false;
    const now = options.now ?? new Date();
    const report = this.emptyReport(dryRun);

    report.worktrees = await this.reapWorktrees(now, dryRun, report.errors);
    report.sandboxStorage = await this.reapSandboxStorage(now, dryRun, report.errors);
    report.tempScratch = await this.reapTempScratch(now, dryRun, report.errors);

    report.bytesReclaimed = [
      ...report.worktrees,
      ...report.sandboxStorage,
      ...report.tempScratch,
    ].reduce((sum, entry) => sum + entry.bytes, 0);

    return report;
  }

  /**
   * Look up the thread that owns a worktree path. Paths are stored exactly as
   * the creating platform wrote them, so match on the directory name too — a
   * gateway that moved hosts still recognises its own worktrees.
   */
  private lookupThread(path: string, dirName: string): ThreadLookupRow | null {
    try {
      const row = this.sqlite
        .prepare(
          `SELECT status, branch, updated_at AS updatedAt
             FROM agent_threads
            WHERE working_directory = ?
               OR working_directory LIKE ?
               OR working_directory LIKE ?
            ORDER BY updated_at DESC
            LIMIT 1`,
        )
        .get(path, `%/${dirName}`, `%\\${dirName}`) as ThreadLookupRow | undefined;
      return row ?? null;
    } catch {
      return null;
    }
  }

  private async reapWorktrees(
    now: Date,
    dryRun: boolean,
    errors: string[],
  ): Promise<ReapedEntry[]> {
    const root = this.roots.worktrees;
    if (!existsSync(root)) return [];

    const reaped: ReapedEntry[] = [];
    let repoDirs: string[];
    try {
      repoDirs = (await readdir(root, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch (err) {
      errors.push(`worktree root unreadable: ${String(err)}`);
      return reaped;
    }

    for (const repoDir of repoDirs) {
      const repoPath = join(root, repoDir);
      let worktreeDirs: string[];
      try {
        worktreeDirs = (await readdir(repoPath, { withFileTypes: true }))
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);
      } catch (err) {
        errors.push(`worktree dir unreadable (${repoDir}): ${String(err)}`);
        continue;
      }

      for (const dirName of worktreeDirs) {
        const path = join(repoPath, dirName);
        if (!isInside(root, path)) continue;

        const decision = await this.shouldReapWorktree(path, dirName, now);
        if (!decision) continue;

        const bytes = await directorySize(path);
        if (!dryRun) {
          try {
            await this.git.cleanupWorktreeWithOptions(path, {
              branch: decision.branch,
              preserveBranch: this.policy.preserveBranches,
            });
            // cleanupWorktreeWithOptions no-ops on non-worktree paths; make sure
            // a stale directory left by a failed checkout still goes away.
            if (existsSync(path)) await rm(path, { recursive: true, force: true });
          } catch (err) {
            errors.push(`worktree reap failed (${path}): ${String(err)}`);
            continue;
          }
        }
        reaped.push({ path, bytes, reason: decision.reason });
      }
    }

    return reaped;
  }

  private async shouldReapWorktree(
    path: string,
    dirName: string,
    now: Date,
  ): Promise<{ reason: string; branch: string | null } | null> {
    const thread = this.lookupThread(path, dirName);

    if (!thread) {
      // No owning thread: the row was deleted or never persisted. Use the
      // directory mtime as the age signal.
      let mtimeMs = 0;
      try {
        mtimeMs = (await stat(path)).mtimeMs;
      } catch {
        return null;
      }
      if (now.getTime() - mtimeMs < this.policy.orphanWorktreeGraceMs) return null;
      return { reason: "orphaned: no owning thread", branch: null };
    }

    if (!TERMINAL_THREAD_STATUSES.includes(thread.status as (typeof TERMINAL_THREAD_STATUSES)[number])) {
      return null; // running / queued — leave it alone
    }

    const updatedAtMs = Date.parse(thread.updatedAt);
    if (Number.isFinite(updatedAtMs) && now.getTime() - updatedAtMs < this.policy.worktreeGraceMs) {
      return null;
    }

    return { reason: `thread ${thread.status}`, branch: thread.branch };
  }

  /**
   * Remove sandbox VM disks left behind when the gateway died before it could
   * stop the container. Age-gated so a sandbox booting right now survives.
   */
  private async reapSandboxStorage(
    now: Date,
    dryRun: boolean,
    errors: string[],
  ): Promise<ReapedEntry[]> {
    const root = this.roots.sandboxStorage;
    if (!existsSync(root)) return [];

    const reaped: ReapedEntry[] = [];
    let entries: string[];
    try {
      entries = (await readdir(root, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch (err) {
      errors.push(`sandbox storage root unreadable: ${String(err)}`);
      return reaped;
    }

    for (const name of entries) {
      const path = join(root, name);
      if (!isInside(root, path)) continue;
      let mtimeMs = 0;
      try {
        mtimeMs = (await stat(path)).mtimeMs;
      } catch {
        continue;
      }
      if (now.getTime() - mtimeMs < this.policy.sandboxStorageMaxAgeMs) continue;

      const bytes = await directorySize(path);
      if (!dryRun) {
        try {
          await rm(path, { recursive: true, force: true });
        } catch (err) {
          errors.push(`sandbox storage reap failed (${path}): ${String(err)}`);
          continue;
        }
      }
      reaped.push({ path, bytes, reason: "stale sandbox VM disk" });
    }

    return reaped;
  }

  /**
   * Remove `jait-*` scratch entries in the OS temp dir. Tools create these for
   * clones, previews, test runs and PR bodies; nothing deletes them today.
   */
  private async reapTempScratch(
    now: Date,
    dryRun: boolean,
    errors: string[],
  ): Promise<ReapedEntry[]> {
    const root = this.roots.temp;
    const sandboxRoot = resolve(this.roots.sandboxStorage);
    const reaped: ReapedEntry[] = [];

    let entries: string[];
    try {
      entries = (await readdir(root, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() || entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => name.startsWith("jait-"));
    } catch (err) {
      errors.push(`temp root unreadable: ${String(err)}`);
      return reaped;
    }

    for (const name of entries) {
      const path = join(root, name);
      if (!isInside(root, path)) continue;
      // The sandbox root lives under /tmp too and has its own age policy.
      if (resolve(path) === sandboxRoot) continue;

      let mtimeMs = 0;
      try {
        mtimeMs = (await stat(path)).mtimeMs;
      } catch {
        continue;
      }
      if (now.getTime() - mtimeMs < this.policy.tempScratchMaxAgeMs) continue;

      const bytes = await directorySize(path);
      if (!dryRun) {
        try {
          await rm(path, { recursive: true, force: true });
        } catch (err) {
          errors.push(`temp scratch reap failed (${path}): ${String(err)}`);
          continue;
        }
      }
      reaped.push({ path, bytes, reason: "stale temp scratch" });
    }

    return reaped;
  }
}
