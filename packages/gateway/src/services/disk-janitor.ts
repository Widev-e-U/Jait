import { getStateDirectory } from "../state-directory.js";
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
import { readdir, rm, rmdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
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
  /**
   * Scratch entries that are stale but cannot be unlinked by this process.
   * The usual cause is a shared temp root with the sticky bit set, holding
   * directories created by another account (CI runs as its own user).
   */
  blockedForeignOwned: number;
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
  return join(getStateDirectory(), "worktrees");
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

export interface TreeMeasurement {
  bytes: number;
  /**
   * Newest mtime anywhere in the tree. A directory's own mtime only moves when
   * direct children are added or removed, so it says nothing about files being
   * written deep inside — the age gate must use this instead.
   */
  newestMtimeMs: number;
}

/** Recursive size and newest write time of a path. Best-effort. */
export async function measureTree(path: string): Promise<TreeMeasurement> {
  const result: TreeMeasurement = { bytes: 0, newestMtimeMs: 0 };
  const note = (mtimeMs: number): void => {
    if (mtimeMs > result.newestMtimeMs) result.newestMtimeMs = mtimeMs;
  };
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
        result.bytes += info.size;
        note(info.mtimeMs);
      } catch { /* best effort */ }
    }
  };
  try {
    const info = await stat(path);
    note(info.mtimeMs);
    if (!info.isDirectory()) {
      result.bytes = info.size;
      return result;
    }
  } catch {
    return result;
  }
  await walk(path);
  return result;
}

/** Recursive size of a directory. Best-effort; unreadable entries count as 0. */
export async function directorySize(path: string): Promise<number> {
  return (await measureTree(path)).bytes;
}

/** True when `path` is a directory carrying the sticky bit (e.g. /tmp). */
async function isStickyDirectory(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isDirectory() && (info.mode & 0o1_000) !== 0;
  } catch {
    return false;
  }
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
  /** Paths whose reap failed with EACCES/EPERM during the current pass. */
  private permissionFailures: string[] = [];
  /** Scratch entries left alone because another account owns them in sticky temp. */
  private blockedForeignOwned = 0;
  /** Last permission-block signature reported, so intervals do not repeat it. */
  private lastPermissionAlert = "";

  constructor(
    private sqlite: SqliteDatabase,
    readonly policy: DiskJanitorPolicy = loadDiskJanitorPolicy(),
    private logger: DiskJanitorLogger = consoleLogger,
    private git: Pick<GitService, "cleanupWorktreeWithOptions"> = new GitService(),
    private roots: DiskJanitorRoots = defaultDiskJanitorRoots(),
    /**
     * Optional user-facing channel. Console logging is invisible when the
     * gateway runs as a service, which is exactly how "disk stays full and
     * nobody knows why" happens: the janitor retries the same undeletable
     * directories every six hours and only writes to a log nobody reads.
     */
    private notify?: (title: string, body: string) => void,
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
        if (report.errors.length > 0) {
          this.logReapErrors(report.errors);
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

  /** Report failures even when a pass reclaims zero bytes. */
  private logReapErrors(errors: string[]): void {
    this.logger.warn(
      "[disk-janitor] " + errors.length + " reap failure(s): " + errors.slice(0, 5).join("; "),
    );
    const permission = errors.filter((e) => /EACCES|EPERM|permission denied/i.test(e));
    if (permission.length > 0) {
      this.logger.error(
        "[disk-janitor] " + permission.length + "/" + errors.length + " failure(s) are permission errors. " +
          "First permission failure: " + permission[0] + ". " +
          "Check ownership and directory permissions at the affected path. " +
          "Writable sandbox mounts should use the host uid/gid so cleanup can succeed.",
      );
    }
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
      blockedForeignOwned: 0,
      skippedReason,
    };
  }

  private async execute(options: DiskJanitorRunOptions): Promise<DiskJanitorReport> {
    const dryRun = options.dryRun ?? false;
    const now = options.now ?? new Date();
    const report = this.emptyReport(dryRun);
    this.permissionFailures = [];
    this.blockedForeignOwned = 0;

    report.worktrees = await this.reapWorktrees(now, dryRun, report.errors);
    report.sandboxStorage = await this.reapSandboxStorage(now, dryRun, report.errors);
    report.tempScratch = await this.reapTempScratch(now, dryRun, report.errors);
    report.blockedForeignOwned = this.blockedForeignOwned;

    if (!dryRun) await this.reportPermissionBlocks(report);

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

      await this.reapEmptyContainer(repoPath, now, dryRun, reaped, errors);
    }

    return reaped;
  }

  /**
   * Remove a per-repo container once it holds no worktrees.
   *
   * `worktrees/<repo>/` is created eagerly the first time a project is
   * executed and is never removed when its last worktree goes away, so every
   * project ever run leaves an empty directory behind. Because the scan above
   * looks one level below these containers, they were invisible to the janitor:
   * a run that reaped all 400 worktrees of a test fixture still left 400 empty
   * containers, and the next run read them as "repo dirs with nothing to do".
   *
   * Only genuinely empty directories are considered, removal uses rmdir (which
   * refuses to touch a non-empty directory), and the age gate keeps a project
   * that is about to receive a worktree safe.
   */
  private async reapEmptyContainer(
    path: string,
    now: Date,
    dryRun: boolean,
    reaped: ReapedEntry[],
    errors: string[],
  ): Promise<void> {
    if (!isInside(this.roots.worktrees, path)) return;

    let entries: string[];
    try {
      entries = await readdir(path);
    } catch (err) {
      errors.push(`worktree container unreadable (${path}): ${String(err)}`);
      return;
    }
    if (entries.length > 0) return;

    let mtimeMs = 0;
    try {
      mtimeMs = (await stat(path)).mtimeMs;
    } catch {
      return;
    }
    if (now.getTime() - mtimeMs < this.policy.orphanWorktreeGraceMs) return;

    if (!dryRun) {
      try {
        await rmdir(path);
      } catch (err) {
        // Something appeared between the readdir and the rmdir: leave it alone.
        if ((err as NodeJS.ErrnoException).code !== "ENOTEMPTY") {
          errors.push(`empty worktree container reap failed (${path}): ${String(err)}`);
        }
        return;
      }
    }
    reaped.push({ path, bytes: 0, reason: "empty worktree container" });
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

      const { bytes, newestMtimeMs } = await measureTree(path);
      // A VM disk written to recently is still in use, whatever its own mtime says.
      if (now.getTime() - newestMtimeMs < this.policy.sandboxStorageMaxAgeMs) continue;

      if (!dryRun) {
        try {
          await rm(path, { recursive: true, force: true });
        } catch (err) {
          errors.push(`sandbox storage reap failed (${path}): ${String(err)}`);
          this.notePermissionFailure(path, err);
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
    // In a sticky temp root (the /tmp every Linux host ships) unlink is reserved
    // for the entry's owner, so entries created by another account are not ours
    // to remove. Detect that up front: it keeps dry runs honest and stops the
    // periodic pass from retrying thousands of guaranteed EPERM failures.
    const sticky = await isStickyDirectory(root);
    const selfUid = process.getuid?.();

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

      const { bytes, newestMtimeMs } = await measureTree(path);
      // Guard against reaping scratch that something is still writing into: the
      // top-level mtime is frozen as long as no new child is created.
      if (now.getTime() - newestMtimeMs < this.policy.tempScratchMaxAgeMs) continue;

      if (sticky && selfUid !== undefined) {
        let ownerUid: number;
        try {
          ownerUid = (await stat(path)).uid;
        } catch {
          continue;
        }
        if (ownerUid !== selfUid) {
          this.blockedForeignOwned += 1;
          continue;
        }
      }

      if (!dryRun) {
        try {
          await rm(path, { recursive: true, force: true });
        } catch (err) {
          errors.push(`temp scratch reap failed (${path}): ${String(err)}`);
          this.notePermissionFailure(path, err);
          continue;
        }
      }
      reaped.push({ path, bytes, reason: "stale temp scratch" });
    }

    return reaped;
  }

  private notePermissionFailure(path: string, err: unknown): void {
    if (/EACCES|EPERM|permission denied/i.test(String(err))) {
      this.permissionFailures.push(path);
    }
  }

  /**
   * Surface undeletable scratch once per distinct condition, with the command
   * that actually fixes it. Retrying silently forever is what makes a stuck
   * temp directory look like a permanent "disk full" warning.
   */
  private async reportPermissionBlocks(report: DiskJanitorReport): Promise<void> {
    if (this.permissionFailures.length === 0 && report.blockedForeignOwned === 0) return;
    const root = this.roots.temp;
    const days = Math.round(this.policy.tempScratchMaxAgeMs / DAY_MS);
    const foreign = report.blockedForeignOwned;
    const signature = `${root}:${foreign}:${this.permissionFailures.length}`;
    if (signature === this.lastPermissionAlert) return;
    this.lastPermissionAlert = signature;

    const body = foreign > 0
      ? `${foreign} jait-* entr${foreign === 1 ? "y" : "ies"} in ${root} belong to another user, ` +
        `and the sticky bit prevents this process (uid ${String(process.getuid?.())}) from removing them. ` +
        `Clear them as root: sudo find ${root} -maxdepth 1 -name 'jait-*' -mtime +${days} -exec rm -rf {} +`
      : `${this.permissionFailures.length} jait-* entr${this.permissionFailures.length === 1 ? "y" : "ies"} in ` +
        `${root} could not be removed (permission denied). Check ownership and directory permissions at ` +
        `${this.permissionFailures[0]}.`;

    this.logger.warn(`[disk-janitor] ${body}`);
    this.notify?.("Disk cleanup blocked", body);
  }
}
