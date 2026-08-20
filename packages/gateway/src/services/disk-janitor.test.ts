import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, utimesSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { migrateDatabase, openDatabase, type JaitDB } from "../db/index.js";
import { ThreadService } from "./threads.js";
import {
  DiskJanitor,
  isInside,
  loadDiskJanitorPolicy,
  type DiskJanitorPolicy,
} from "./disk-janitor.js";

const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;

function policy(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitorPolicy {
  return {
    enabled: true,
    worktreeGraceMs: 2 * DAY_MS,
    orphanWorktreeGraceMs: DAY_MS,
    preserveBranches: true,
    tempScratchMaxAgeMs: 3 * DAY_MS,
    sandboxStorageMaxAgeMs: DAY_MS,
    initialDelayMs: 10,
    intervalMs: 1_000,
    ...overrides,
  };
}

/** Create a directory holding one file, aged `ageMs` before NOW. */
function makeAgedDir(path: string, ageMs: number, bytes = 128): void {
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, "payload.bin"), Buffer.alloc(bytes));
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
}

describe("DiskJanitor", () => {
  let db: JaitDB;
  let sqlite: Database;
  let root: string;
  let worktreeRoot: string;
  let tempRoot: string;
  let sandboxRoot: string;
  let cleanupCalls: Array<{ path: string; preserveBranch?: boolean; branch?: string | null }>;
  let gitStub: { cleanupWorktreeWithOptions: (p: string, o?: never) => Promise<void> };

  beforeEach(async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    root = mkdtempSync(join(tmpdir(), "janitor-test-"));
    worktreeRoot = join(root, "worktrees");
    mkdirSync(worktreeRoot, { recursive: true });
    tempRoot = join(root, "temp");
    sandboxRoot = join(root, "sandbox");
    mkdirSync(tempRoot, { recursive: true });
    mkdirSync(sandboxRoot, { recursive: true });

    cleanupCalls = [];
    gitStub = {
      cleanupWorktreeWithOptions: async (path: string, options?: never) => {
        cleanupCalls.push({ path, ...(options ?? {}) });
        await rm(path, { recursive: true, force: true });
      },
    };

  });

  afterEach(async () => {
    sqlite.close();
    await rm(root, { recursive: true, force: true });
  });

  function janitor(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitor {
    return new DiskJanitor(sqlite, policy(overrides), {
      info: () => {},
      warn: () => {},
      error: () => {},
    }, gitStub as never, {
      worktrees: worktreeRoot,
      temp: tempRoot,
      sandboxStorage: sandboxRoot,
    });
  }

  function seedThread(params: {
    workingDirectory: string;
    status: string;
    updatedAt: string;
    branch?: string;
  }): string {
    const threads = new ThreadService(db);
    const thread = threads.create({ title: "t", providerId: "codex" });
    sqlite
      .prepare(
        "UPDATE agent_threads SET working_directory = ?, status = ?, updated_at = ?, branch = ? WHERE id = ?",
      )
      .run(
        params.workingDirectory,
        params.status,
        params.updatedAt,
        params.branch ?? null,
        thread.id,
      );
    return thread.id;
  }

  it("reaps a worktree whose thread finished outside the grace period", async () => {
    const path = join(worktreeRoot, "repo", "jait-aaa");
    makeAgedDir(path, 10 * DAY_MS);
    seedThread({
      workingDirectory: path,
      status: "completed",
      updatedAt: new Date(NOW.getTime() - 10 * DAY_MS).toISOString(),
      branch: "jait/aaa",
    });

    const report = await janitor().run({ now: NOW });

    expect(report.worktrees).toHaveLength(1);
    expect(report.worktrees[0]?.reason).toBe("thread completed");
    expect(existsSync(path)).toBe(false);
  });

  it("never reaps a worktree belonging to a running thread", async () => {
    const path = join(worktreeRoot, "repo", "jait-live");
    makeAgedDir(path, 30 * DAY_MS);
    seedThread({
      workingDirectory: path,
      status: "running",
      updatedAt: new Date(NOW.getTime() - 30 * DAY_MS).toISOString(),
    });

    const report = await janitor().run({ now: NOW });

    expect(report.worktrees).toHaveLength(0);
    expect(existsSync(path)).toBe(true);
  });

  it("keeps a finished worktree until the grace period elapses", async () => {
    const path = join(worktreeRoot, "repo", "jait-fresh");
    makeAgedDir(path, 1 * DAY_MS);
    seedThread({
      workingDirectory: path,
      status: "completed",
      updatedAt: new Date(NOW.getTime() - 1 * DAY_MS).toISOString(),
    });

    const report = await janitor({ worktreeGraceMs: 2 * DAY_MS }).run({ now: NOW });

    expect(report.worktrees).toHaveLength(0);
    expect(existsSync(path)).toBe(true);
  });

  it("reaps an orphaned worktree that has no thread row", async () => {
    const path = join(worktreeRoot, "repo", "jait-orphan");
    makeAgedDir(path, 5 * DAY_MS);

    const report = await janitor().run({ now: NOW });

    expect(report.worktrees).toHaveLength(1);
    expect(report.worktrees[0]?.reason).toBe("orphaned: no owning thread");
    expect(existsSync(path)).toBe(false);
  });

  it("preserves the git branch so committed work stays recoverable", async () => {
    const path = join(worktreeRoot, "repo", "jait-branch");
    makeAgedDir(path, 10 * DAY_MS);
    seedThread({
      workingDirectory: path,
      status: "error",
      updatedAt: new Date(NOW.getTime() - 10 * DAY_MS).toISOString(),
      branch: "jait/branch",
    });

    await janitor({ preserveBranches: true }).run({ now: NOW });

    expect(cleanupCalls[0]?.preserveBranch).toBe(true);
    expect(cleanupCalls[0]?.branch).toBe("jait/branch");
  });

  it("matches worktrees recorded with a foreign-platform path", async () => {
    const path = join(worktreeRoot, "repo", "jait-win");
    makeAgedDir(path, 10 * DAY_MS);
    // Thread was created on Windows; the stored path does not match this host.
    seedThread({
      workingDirectory: "C:\\Users\\jakob\\.jait\\worktrees\\repo\\jait-win",
      status: "completed",
      updatedAt: new Date(NOW.getTime() - 10 * DAY_MS).toISOString(),
    });

    const report = await janitor().run({ now: NOW });

    expect(report.worktrees).toHaveLength(1);
    expect(report.worktrees[0]?.reason).toBe("thread completed");
  });

  it("reports bytes without deleting anything on a dry run", async () => {
    const path = join(worktreeRoot, "repo", "jait-dry");
    makeAgedDir(path, 10 * DAY_MS, 4096);

    const report = await janitor().inspect(NOW);

    expect(report.dryRun).toBe(true);
    expect(report.worktrees).toHaveLength(1);
    expect(report.bytesReclaimed).toBeGreaterThanOrEqual(4096);
    expect(existsSync(path)).toBe(true);
  });

  it("skips the run entirely when disabled", async () => {
    const path = join(worktreeRoot, "repo", "jait-off");
    makeAgedDir(path, 30 * DAY_MS);

    const report = await janitor({ enabled: false }).run({ now: NOW });

    expect(report.skippedReason).toBe("disabled");
    expect(existsSync(path)).toBe(true);
  });

  it("refuses to treat a path outside the managed root as reapable", () => {
    expect(isInside("/home/u/.jait/worktrees", "/home/u/.jait/worktrees/repo/a")).toBe(true);
    expect(isInside("/home/u/.jait/worktrees", "/home/u/.jait/worktrees")).toBe(false);
    expect(isInside("/home/u/.jait/worktrees", "/home/u/projects/real-repo")).toBe(false);
    expect(isInside("/home/u/.jait/worktrees", "/home/u/.jait/worktrees/../../secrets")).toBe(
      false,
    );
  });

  it("enables the janitor by default so shipped installs self-clean", () => {
    expect(loadDiskJanitorPolicy({}).enabled).toBe(true);
    expect(loadDiskJanitorPolicy({ JAIT_DISK_JANITOR_ENABLED: "false" }).enabled).toBe(false);

  });
  it("reaps only Jait scratch entries inside its configured temp root", async () => {
    const stale = join(tempRoot, "jait-stale");
    const unrelated = join(tempRoot, "unrelated");
    makeAgedDir(stale, 4 * DAY_MS, 4096);
    makeAgedDir(unrelated, 4 * DAY_MS, 4096);

    const report = await janitor().run({ now: NOW });

    expect(report.tempScratch).toHaveLength(1);
    expect(report.tempScratch[0]?.path).toBe(stale);
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(unrelated)).toBe(true);
  });

  it("reaps stale sandbox storage only inside its configured root", async () => {
    const stale = join(sandboxRoot, "stale-vm");
    makeAgedDir(stale, 2 * DAY_MS, 2048);

    const report = await janitor().run({ now: NOW });

    expect(report.sandboxStorage).toHaveLength(1);
    expect(report.sandboxStorage[0]?.path).toBe(stale);
    expect(existsSync(stale)).toBe(false);
  });
});
