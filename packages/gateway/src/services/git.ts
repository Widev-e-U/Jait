import { getStateDirectory } from "../state-directory.js";
/**
 * Server-side git operations service.
 *
 * Executes git and `gh` CLI commands in the requested working directory.
 * Adapted from the t3code GitService/GitManager pattern but running
 * directly through child_process on the gateway.
 */

import { exec as execCb, spawn } from "node:child_process";
import { readFile, writeFile, unlink, mkdir, rm, readdir, stat, lstat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
function exec(cmd: string, opts?: Record<string, unknown>): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execCb(
      cmd,
      { encoding: "utf-8" as const, windowsHide: true, ...opts },
      (error, stdout, stderr) => {
        if (error) {
          const enriched = error as Error & { stdout?: string; stderr?: string };
          enriched.stdout = stdout;
          enriched.stderr = stderr;
          reject(enriched);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}
const DEFAULT_TIMEOUT = 30_000;

function trimCommandOutput(stdout: string): string {
  return stdout.replace(/\r?\n$/, "");
}

// Working-tree reads for diff entries must be size-capped: the `git show` side
// of a diff already fails safely past exec's maxBuffer, but an uncapped
// readFile of a large modified file (a rebuilt artifact, an archive) balloons
// this process and every client that receives the diff payload — desktop
// renderers hit V8's ~2 GB heap ceiling and OOM-crash on every reconnect.
const MAX_DIFF_FILE_BYTES = 10 * 1024 * 1024;
/** Ceiling for one batched `git cat-file --batch` diff read; past it we fall back to per-file reads. */
const MAX_DIFF_BATCH_OUTPUT_BYTES = 64 * 1024 * 1024;
const COMMITTABLE_PATHSPEC = '-- . ":(exclude).jait/release-checkout-*"';

// A repo is treated as "large" (and routed through the fast CoW worktree
// path) when it has more than this many tracked files. `git ls-files | wc -l`
// is cheap even on huge repos, so this is the primary signal.
const LARGE_REPO_FILE_THRESHOLD = 5_000;
// Secondary signal: working-tree size in bytes (including .git). Only used
// when the file-count probe fails. `du -sk` is fast enough for this.
const LARGE_REPO_BYTES_THRESHOLD = 512 * 1024 * 1024;

/** Read a working-tree file for diff display; oversized files get a short placeholder instead. */
async function readDiffFileCapped(absPath: string): Promise<string> {
  const info = await stat(absPath);
  if (info.size > MAX_DIFF_FILE_BYTES) {
    return `(file too large to diff: ${(info.size / 1048576).toFixed(1)} MB, limit ${(MAX_DIFF_FILE_BYTES / 1048576).toFixed(0)} MB)`;
  }
  return readFile(absPath, "utf-8");
}

function escapeShellArg(value: string): string {
  return value.replace(/(["\\$`])/g, "\\$1");
}

/**
 * Read many revision blobs (`<rev>:<path>` specs) in a single
 * `git cat-file --batch` process instead of one `git show` per file. A diff of
 * a 40-file change drops from 40 process spawns to one, which is the dominant
 * cost of opening the diff HUD on large changesets. Objects that don't exist
 * (new files, deleted parents, bad refs) map to the empty string, matching the
 * old best-effort `git show` behaviour. Oversized blobs get the same
 * "too large to diff" placeholder the working-tree reader uses so a stray
 * artifact can't blow up the payload.
 */
async function readBlobsBatch(
  cwd: string,
  specs: readonly string[],
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const unique = [...new Set(specs)];
  if (!unique.length) return results;

  const input = Buffer.from(unique.map((spec) => `${spec}\n`).join(""), "utf8");
  const stdout = await gitExecBufferArgs(cwd, ["cat-file", "--batch"], DEFAULT_TIMEOUT, {
    input,
    maxOutputBytes: MAX_DIFF_BATCH_OUTPUT_BYTES,
  });

  let offset = 0;
  for (const spec of unique) {
    if (offset >= stdout.length) break;
    const headerEnd = stdout.indexOf(0x0a, offset);
    if (headerEnd === -1) break;
    const header = stdout.toString("utf8", offset, headerEnd);
    offset = headerEnd + 1;
    if (header.endsWith(" missing")) {
      results.set(spec, "");
      continue;
    }
    const size = Number.parseInt(header.slice(header.lastIndexOf(" ") + 1), 10);
    if (!Number.isFinite(size) || size < 0) {
      results.set(spec, "");
      continue;
    }
    if (size > MAX_DIFF_FILE_BYTES) {
      results.set(spec, `(file too large to diff: ${(size / 1048576).toFixed(1)} MB, limit ${(MAX_DIFF_FILE_BYTES / 1048576).toFixed(0)} MB)`);
    } else {
      results.set(spec, trimCommandOutput(stdout.toString("utf8", offset, offset + size)));
    }
    offset += size + 1;
  }
  return results;
}

/**
 * Batch reader that degrades to per-file `git show` if the single `cat-file`
 * process fails (output cap exceeded, git too old, repo mid-GC). The fallback
 * is still bounded to `DIFF_READ_CONCURRENCY` spawns at once, never all N.
 */
async function readBlobsBatchSafe(
  cwd: string,
  specs: readonly string[],
): Promise<Map<string, string>> {
  try {
    return await readBlobsBatch(cwd, specs);
  } catch {
    const results = new Map<string, string>();
    await mapWithConcurrency([...new Set(specs)], DIFF_READ_CONCURRENCY, async (spec) => {
      try {
        results.set(spec, trimCommandOutput(await gitExec(cwd, `show ${JSON.stringify(spec)}`)));
      } catch {
        results.set(spec, "");
      }
    });
    return results;
  }
}

/** How many file contents a diff request reads at once. */
const DIFF_READ_CONCURRENCY = 8;

/** Normalize a requested path subset; `undefined`/empty means "every change". */
function normalizeDiffPathFilter(paths?: string[]): Set<string> | null {
  if (!paths?.length) return null;
  const filter = new Set<string>();
  for (const raw of paths) {
    if (typeof raw !== "string") continue;
    const normalized = raw.replace(/^\/+/, "").replace(/\\/g, "/").replace(/\/+$/, "");
    if (normalized) filter.add(normalized);
  }
  return filter.size ? filter : null;
}

function matchesDiffPathFilter(filePath: string, filter: Set<string> | null): boolean {
  if (!filter) return true;
  const normalized = filePath.replace(/\\/g, "/");
  return filter.has(normalized) || filter.has(normalized.replace(/^\.\//, ""));
}

/** Ordered bounded-concurrency map: fast for I/O, never spawns N processes at once. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

/** True only for descendants of Jait's owned worktree root. */
export function isManagedWorktreePath(worktreePath: string): boolean {
  const managedRoot = resolve(getStateDirectory(), "worktrees");
  const candidate = resolve(worktreePath);
  return candidate !== managedRoot && candidate.startsWith(`${managedRoot}${sep}`);
}

async function getBranchUpstream(cwd: string, branch: string): Promise<string | null> {
  return BRANCH_UPSTREAM_MEMO(repoFactKey(cwd, `upstream${GIT_FACT_SEP}${branch}`), async () => {
    const ref = escapeShellArg(`refs/heads/${branch}`);
    const upstream = await gitExec(cwd, `for-each-ref --format="%(upstream:short)" "${ref}"`).catch(() => "");
    return upstream.trim() || null;
  });
}

async function getConfiguredBranchRemote(cwd: string, branch: string): Promise<string | null> {
  return BRANCH_REMOTE_MEMO(repoFactKey(cwd, `branch-remote${GIT_FACT_SEP}${branch}`), async () => {
    const key = escapeShellArg(`branch.${branch}.remote`);
    const remote = await gitExec(cwd, `config --default "" --get "${key}"`).catch(() => "");
    return remote.trim() || null;
  });
}

// ── Types ──────────────────────────────────────────────────────────

export type GitStackedAction = "commit" | "commit_push" | "commit_push_pr";

export interface GitStatusFile {
  path: string;
  insertions: number;
  deletions: number;
  /** 'A' = added, 'M' = modified, 'D' = deleted, 'R' = renamed, '?' = untracked */
  status: string;
}

export interface GitStatusPr {
  number: number;
  title: string;
  url: string;
  baseBranch: string;
  headBranch: string;
  state: "open" | "closed" | "merged";
}

export interface GitStatusResult {
  branch: string | null;
  hasWorkingTreeChanges: boolean;
  index: {
    files: GitStatusFile[];
    insertions: number;
    deletions: number;
  };
  workingTree: {
    files: GitStatusFile[];
    insertions: number;
    deletions: number;
  };
  hasUpstream: boolean;
  aheadCount: number;
  behindCount: number;
  pr: GitStatusPr | null;
  /** Whether GitHub CLI (`gh`) is installed and authenticated. */
  ghAvailable: boolean;
  /** Hosting provider inferred from the preferred remote URL. */
  prProvider: GitRemoteProvider;
  /** HTTPS remote URL for the primary remote (origin/Jait/etc.) */
  remoteUrl: string | null;
}

export interface GitBranch {
  name: string;
  isRemote: boolean;
  current: boolean;
  isDefault: boolean;
  worktreePath: string | null;
}

export interface GitListBranchesResult {
  branches: GitBranch[];
  isRepo: boolean;
}

export interface GitStepResult {
  commit: { status: "created" | "skipped_no_changes"; commitSha?: string; subject?: string };
  push: { status: "pushed" | "skipped_not_requested" | "skipped_up_to_date" | "skipped_no_remote" | "failed"; branch?: string; upstreamBranch?: string; setUpstream?: boolean; createPrUrl?: string; error?: string };
  branch: { status: "created" | "skipped_not_requested"; name?: string };
  pr: { status: "created" | "opened_existing" | "skipped_not_requested" | "skipped_no_remote"; url?: string; number?: number; baseBranch?: string; headBranch?: string; title?: string };
}

export interface GitDiffResult {
  diff: string;
  files: string[];
  hasChanges: boolean;
}

export interface GitDiffStatsResult {
  files: number;
  insertions: number;
  deletions: number;
  hasChanges: boolean;
}

function normalizeStatusChar(char: string): string {
  if (char === "?") return "?";
  if (char === "A") return "A";
  if (char === "D") return "D";
  if (char === "R" || char === "C") return "R";
  return "M";
}

export interface FileDiffEntry {
  path: string;
  /** Original (HEAD) content, empty for new files */
  original: string;
  /** Current working-tree content, empty for deleted files */
  modified: string;
  /** 'A' = added, 'M' = modified, 'D' = deleted, 'R' = renamed, '?' = untracked */
  status: string;
}

export interface GitPullResult {
  status: "pulled" | "skipped_up_to_date";
  branch: string;
  upstreamBranch: string | null;
}

export interface GitSyncResult {
  branch: string;
  upstreamBranch: string | null;
  pull: { status: "pulled" | "skipped_up_to_date" | "skipped_no_upstream" };
  push: { status: "pushed" | "skipped_up_to_date" | "skipped_no_remote" };
}

export interface GitVersionBumpResult {
  previousVersion: string;
  nextVersion: string;
  files: string[];
}

export interface GitCommitFlowResult {
  version: GitVersionBumpResult;
  sync: {
    status: "pulled" | "skipped_up_to_date" | "skipped_no_upstream";
    branch: string | null;
    upstreamBranch: string | null;
  };
  git: GitStepResult;
}

export interface GitFetchResult {
  status: "fetched" | "skipped_no_remote";
  remote: string | null;
  allRemotes: boolean;
}

export interface GitWorktreeResult {
  path: string;
  branch: string;
}

export interface GitIdentity {
  name: string | null;
  email: string | null;
}

export interface PrCheck {
  name: string;
  state: string;
  conclusion: string;
  startedAt: string;
  completedAt: string;
  detailsUrl: string;
}

export type GitRemoteProvider =
  | "github"
  | "azure-devops"
  | "gitlab"
  | "bitbucket"
  | "gitea"
  | "unknown"
  | "none";

export interface ParsedRemote {
  provider: Exclude<GitRemoteProvider, "none" | "unknown">;
  host: string;
  normalizedUrl: string;
  repo: string;
  owner?: string;
  organization?: string;
  project?: string;
}

// ── Per-worktree mutex ─────────────────────────────────────────────

/**
 * Per-working-directory reader/writer lock.
 *
 * Mutating git commands (commit, checkout, merge, add, …) must never overlap
 * inside one repo: that is what index.lock races came from. Pure reads
 * (`status`, `diff`, `show`, `log`, `cat-file`, …) only take transient locks
 * and are safe to overlap, so they share the repo concurrently. Every reader
 * still blocks writers and vice versa, so writers keep the old serialization
 * guarantee while read-heavy surfaces (status badge, diff HUD) stop queueing
 * behind each other.
 */
type GitLockMode = "read" | "write";

interface GitLockState {
  readers: number;
  writerActive: boolean;
  /** FIFO waiters; a draining writer blocks queued readers to avoid starvation. */
  waiters: Array<{ mode: GitLockMode; grant: () => void }>;
}

const gitLocks = new Map<string, GitLockState>();

/**
 * git subcommands that never mutate the index, refs or object database and can
 * therefore run concurrently with other readers. Anything not listed (unknown
 * subcommands, plumbing that writes, `branch -d`, `stash`, `worktree`, …)
 * defaults to exclusive, so the safe behaviour is what you get for free.
 */
const GIT_READ_ONLY_SUBCOMMANDS = new Set([
  "status",
  "diff",
  "show",
  "log",
  "rev-parse",
  "rev-list",
  "cat-file",
  "ls-files",
  "ls-tree",
  "for-each-ref",
  "merge-base",
  "describe",
  "shortlog",
  "name-rev",
  "blame",
  "whatchanged",
  "count-objects",
  "var",
  "grep",
  "show-ref",
]);

/** Classify a `git <args>` invocation as a concurrent-safe read or a mutation. */
export function gitCommandMode(args: string): GitLockMode {
  const match = args.trim().match(/^([a-z][a-z0-9-]*)/i);
  const subcommand = match?.[1]?.toLowerCase() ?? "";
  if (!subcommand) return "write";
  // `config --get`/`--list` only read; bare `config <k> <v>` writes.
  if (subcommand === "config") return /\s--(get|get-all|list|get-regexp)\b/.test(args) ? "read" : "write";
  // `remote -v` / bare `remote` list; `remote add`/`set-url` write.
  if (subcommand === "remote") return /^remote(\s+-v|\s*)$/.test(args.trim()) ? "read" : "write";
  // `branch --list`-style reads only.
  if (subcommand === "branch") {
    return /\s(--list|-l|--all|-a|--remotes|-r|--show-current|--contains|--merged|--no-merged|--format)\b/.test(args)
      ? "read"
      : "write";
  }
  if (subcommand === "symbolic-ref") return args.trim().split(/\s+/).length <= 2 ? "read" : "write";
  return GIT_READ_ONLY_SUBCOMMANDS.has(subcommand) ? "read" : "write";
}

function acquireGitLock(key: string, mode: GitLockMode): Promise<() => void> {
  const state = gitLocks.get(key) ?? { readers: 0, writerActive: false, waiters: [] };
  gitLocks.set(key, state);

  return new Promise<() => void>((resolve) => {
    const release = () => {
      if (mode === "read") state.readers = Math.max(0, state.readers - 1);
      else state.writerActive = false;
      drain(key, state);
    };
    if (canGrant(state, mode)) {
      reserve(state, mode);
      resolve(release);
      return;
    }
    state.waiters.push({
      mode,
      grant: () => {
        reserve(state, mode);
        resolve(release);
      },
    });
  });
}

function canGrant(state: GitLockState, mode: GitLockMode): boolean {
  if (state.writerActive) return false;
  if (mode === "read") return state.waiters.length === 0;
  return state.readers === 0 && state.waiters.length === 0;
}

function reserve(state: GitLockState, mode: GitLockMode): void {
  if (mode === "read") state.readers += 1;
  else state.writerActive = true;
}

function drain(key: string, state: GitLockState): void {
  // A queued writer takes priority: grant it only when the repo is idle.
  while (state.waiters.length) {
    const head = state.waiters[0]!;
    if (state.writerActive) return;
    if (head.mode === "read") {
      // Grant every consecutive reader at the head of the queue in one go.
      do {
        state.waiters.shift()!.grant();
      } while (state.waiters[0]?.mode === "read");
      continue;
    }
    if (state.readers > 0) return; // readers still draining
    state.waiters.shift()!.grant();
  }
  if (!state.writerActive && state.readers === 0 && gitLocks.get(key) === state) {
    gitLocks.delete(key);
  }
}

function withGitLock<T>(cwd: string, fn: () => Promise<T>, mode: GitLockMode = "write"): Promise<T> {
  const key = resolve(cwd).replace(/\\/g, "/");
  return acquireGitLock(key, mode).then(async (release) => {
    try {
      return await fn();
    } finally {
      release();
    }
  });
}

/** Run a git command under the repo's shared reader lock (concurrent-safe read). */
export function gitExecRead(cwd: string, args: string, timeout = DEFAULT_TIMEOUT): Promise<string> {
  return withGitLock(cwd, async () => {
    const { stdout } = await exec(`git ${args}`, { cwd, timeout });
    return trimCommandOutput(stdout);
  }, "read");
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Promise-aware value-TTL memo.
 *
 * Git surfaces repeatedly ask the same "constant" questions — is this path a
 * repo, is `gh` installed — and each probe costs a process spawn. This memo
 * collapses those to at most one spawn per TTL window and also dedupes probes
 * that arrive while the first one is still in flight. TTLs are keyed off the
 * *value* so cheap negative answers (e.g. "not a repo yet") can expire almost
 * immediately while stable positive answers are cached for longer. Failures are
 * never cached.
 */
interface ValueMemo<T> {
  (key: string, factory: () => Promise<T>): Promise<T>;
  /** Forget a cached value so the next call re-probes. */
  invalidate(key: string): void;
  /** Forget every entry whose key starts with `prefix` (per-repo fact groups). */
  invalidatePrefix(prefix: string): void;
  /** Forget everything (tests / explicit refresh). */
  clear(): void;
}

function createValueMemo<T>(ttlFor: (value: T) => number): ValueMemo<T> {
  const cache = new Map<string, { value: T; expiresAt: number }>();
  const pending = new Map<string, Promise<T>>();
  const memo = ((key: string, factory: () => Promise<T>): Promise<T> => {
    const hit = cache.get(key);
    if (hit) {
      if (hit.expiresAt > Date.now()) return Promise.resolve(hit.value);
      cache.delete(key);
    }
    const inflight = pending.get(key);
    if (inflight) return inflight;
    const promise = factory()
      .then((value) => {
        pending.delete(key);
        cache.set(key, { value, expiresAt: Date.now() + ttlFor(value) });
        return value;
      })
      .catch((error: unknown) => {
        pending.delete(key);
        throw error;
      });
    pending.set(key, promise);
    return promise;
  }) as ValueMemo<T>;
  memo.invalidate = (key) => { cache.delete(key); };
  memo.invalidatePrefix = (prefix) => {
    for (const key of [...cache.keys()]) if (key.startsWith(prefix)) cache.delete(key);
  };
  memo.clear = () => { cache.clear(); pending.clear(); };
  return memo;
}

const IS_REPO_MEMO = createValueMemo<boolean>((isRepo) => (isRepo ? 60_000 : 1_000));
const GH_AVAILABLE_MEMO = createValueMemo<boolean>((available) => (available ? 300_000 : 10_000));
// Remote topology and branch-tracking facts change only on explicit git writes
// (`remote add`, `push -u`, `branch --set-upstream`), so they stay cached until a
// write to that repo drops them. Every value below is positive when true, so the
// long TTL is safe: a negative answer means the fact genuinely isn't configured.
const REMOTE_LIST_MEMO = createValueMemo<string[]>(() => 300_000);
const REMOTE_URL_MEMO = createValueMemo<string | null>(() => 60_000);
const HAS_REMOTE_MEMO = createValueMemo<boolean>((exists) => (exists ? 300_000 : 5_000));
const BRANCH_UPSTREAM_MEMO = createValueMemo<string | null>((upstream) => (upstream ? 300_000 : 5_000));
const BRANCH_REMOTE_MEMO = createValueMemo<string | null>((remote) => (remote ? 300_000 : 5_000));
// Short-TTL memo for whole status payloads: several surfaces (badge, HUD, panel,
// watcher) and several clients poll the same repo within the same second, and
// each uncached poll costs 3+ git spawns. Cleared by any write to the repo.
const STATUS_MEMO_MS = 1_000;
const STATUS_MEMO = createValueMemo<GitStatusResult | null>(() => STATUS_MEMO_MS);
// The branch list is read by pickers/panels that can re-mount on every render,
// and each uncached list costs 3-4 git spawns. Branch/remote/worktree topology
// only changes on a git write (which drops this), so a short TTL absorbs the
// burst without ever serving stale topology across a mutation.
const BRANCH_LIST_MEMO_MS = 1_000;
const BRANCH_LIST_MEMO = createValueMemo<GitListBranchesResult>(() => BRANCH_LIST_MEMO_MS);
// Resolving the main repo root costs a `rev-parse` per call and is hit by every
// preferred-remote lookup; like the facts above it only moves on a write.
const MAIN_REPO_ROOT_MEMO = createValueMemo<string>(() => 300_000);
const GIT_FACT_SEP = "\u0000";

/** Shared frozen payload for a directory that is not a git repo. */
const EMPTY_STATUS: GitStatusResult = Object.freeze({
  branch: null,
  hasWorkingTreeChanges: false,
  index: { files: [], insertions: 0, deletions: 0 },
  workingTree: { files: [], insertions: 0, deletions: 0 },
  hasUpstream: false,
  aheadCount: 0,
  behindCount: 0,
  pr: null,
  ghAvailable: false,
  prProvider: "none",
  remoteUrl: null,
}) as GitStatusResult;

/** Cache key for per-repo memos; absolute + normalized so aliases collapse. */
function repoMemoKey(cwd: string): string {
  return resolve(cwd).replace(/\\/g, "/");
}

/** Namespaced cache key for one repo fact, so a write can drop the whole group. */
function repoFactKey(cwd: string, fact: string): string {
  return `${repoMemoKey(cwd)}${GIT_FACT_SEP}${fact}`;
}

/** Drop memoized repo facts for a path (call after init/clone creates a repo). */
export function invalidateGitRepoMemo(cwd: string): void {
  dropRepoGitCaches(cwd);
}

/** Drop every cached fact about one repo after a command that may change it. */
function dropRepoGitCaches(cwd: string): void {
  const prefix = `${repoMemoKey(cwd)}${GIT_FACT_SEP}`;
  IS_REPO_MEMO.invalidatePrefix(prefix);
  REMOTE_LIST_MEMO.invalidatePrefix(prefix);
  REMOTE_URL_MEMO.invalidatePrefix(prefix);
  HAS_REMOTE_MEMO.invalidatePrefix(prefix);
  BRANCH_UPSTREAM_MEMO.invalidatePrefix(prefix);
  BRANCH_REMOTE_MEMO.invalidatePrefix(prefix);
  STATUS_MEMO.invalidatePrefix(prefix);
  BRANCH_LIST_MEMO.invalidatePrefix(prefix);
  MAIN_REPO_ROOT_MEMO.invalidatePrefix(prefix);
}


async function gitExec(cwd: string, args: string, timeout = DEFAULT_TIMEOUT): Promise<string> {
  const mode = gitCommandMode(args);
  const output = await withGitLock(cwd, async () => {
    const { stdout } = await exec(`git ${args}`, { cwd, timeout });
    return trimCommandOutput(stdout);
  }, mode);
  // Any mutation can change branch/remote/status facts; drop that repo's memo
  // group so the next read re-probes instead of serving a stale badge.
  if (mode === "write") dropRepoGitCaches(cwd);
  return output;
}

export { gitExec };

export async function gitExecRaw(cwd: string, args: string, timeout = DEFAULT_TIMEOUT): Promise<string> {
  const { stdout } = await exec(`git ${args}`, { cwd, timeout });
  return stdout;
}

export interface GitArgExecOptions {
  env?: NodeJS.ProcessEnv;
  redactions?: readonly string[];
  maxOutputBytes?: number;
  /** Payload written to the child's stdin before it is closed. */
  input?: string | Buffer;
}

const DEFAULT_ARG_OUTPUT_BYTES = 16 * 1024 * 1024;

function redactCommandError(value: string, secrets: readonly string[] = []): string {
  let redacted = value.replace(/https:\/\/[^@\s/]+@/gi, "https://[REDACTED]@");
  for (const secret of secrets) {
    if (secret) redacted = redacted.split(secret).join("[REDACTED]");
  }
  return redacted;
}

function execArgs(
  command: string,
  args: string[],
  options: { cwd: string; timeout: number } & GitArgExecOptions,
): Promise<{ stdout: Buffer; stderr: Buffer }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_ARG_OUTPUT_BYTES;
    let outputBytes = 0;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolvePromise({ stdout: Buffer.concat(stdoutChunks), stderr: Buffer.concat(stderrChunks) });
    };
    const append = (target: Buffer[], chunk: Buffer) => {
      if (settled) return;
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        child.kill("SIGTERM");
        finish(new Error(`${command} produced too much output.`));
        return;
      }
      target.push(chunk);
    };

    if (!child.stdout || !child.stderr) {
      finish(new Error(`${command} failed to start.`));
      return;
    }
    child.stdout.on("data", (chunk: Buffer) => append(stdoutChunks, chunk));
    child.stderr.on("data", (chunk: Buffer) => append(stderrChunks, chunk));
    if (options.input !== undefined && child.stdin) {
      // EPIPE is expected when the child exits before consuming all input.
      child.stdin.on("error", () => {});
      child.stdin.end(options.input);
    }
    child.on("error", (error) => finish(new Error(
      redactCommandError(error.message, options.redactions),
    )));
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
        finish(new Error(redactCommandError(
          stderr || `${command} exited with code ${code ?? "unknown"}.`,
          options.redactions,
        )));
        return;
      }
      finish();
    });
    timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new Error(`${command} command timed out.`));
    }, options.timeout);
  });
}

export async function gitExecArgs(
  cwd: string,
  args: string[],
  timeout = DEFAULT_TIMEOUT,
  options: GitArgExecOptions = {},
): Promise<string> {
  const mode = gitCommandMode(args.join(" "));
  return withGitLock(cwd, async () => {
    const { stdout } = await execArgs("git", args, { cwd, timeout, ...options });
    return trimCommandOutput(stdout.toString("utf8"));
  }, mode);
}

export async function gitExecBufferArgs(
  cwd: string,
  args: string[],
  timeout = DEFAULT_TIMEOUT,
  options: GitArgExecOptions = {},
): Promise<Buffer> {
  const mode = gitCommandMode(args.join(" "));
  return withGitLock(cwd, async () => {
    const { stdout } = await execArgs("git", args, { cwd, timeout, ...options });
    return stdout;
  }, mode);
}

function gitRevisionPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\.\/+/, "");
  return `./${normalized}`;
}

function ghCleanEnv(): NodeJS.ProcessEnv {
  const { GH_REPO, GH_HOST, GH_TOKEN, GITHUB_TOKEN, ...rest } = process.env;
  return rest;
}

export async function ghExecArgs(
  cwd: string,
  args: string[],
  timeout = DEFAULT_TIMEOUT,
  options: GitArgExecOptions = {},
): Promise<string> {
  const { stdout } = await execArgs("gh", args, {
    cwd,
    timeout,
    ...options,
    env: options.env ?? ghCleanEnv(),
  });
  return trimCommandOutput(stdout.toString("utf8"));
}

async function ghExec(cwd: string, args: string, timeout = DEFAULT_TIMEOUT): Promise<string> {
  const { stdout } = await exec(`gh ${args}`, { cwd, timeout, env: ghCleanEnv() });
  return trimCommandOutput(stdout);
}

export { ghExec };

async function ghAvailable(cwd: string): Promise<boolean> {
  return GH_AVAILABLE_MEMO("gh", async () => {
    try {
      await exec("gh --version", { cwd, timeout: 5_000, env: ghCleanEnv() });
      return true;
    } catch {
      return false;
    }
  });
}

async function listChildPackageJsonFiles(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const packageJson = join(root, entry.name, "package.json");
    if (existsSync(packageJson)) files.push(packageJson);
  }
  return files;
}

function bumpPatchVersion(version: string): string | null {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)([-+].+)?$/);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const suffix = match[4] ?? "";
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) return null;
  return `${major}.${minor}.${patch + 1}${suffix}`;
}

function isNonFastForwardPushError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("non-fast-forward")
    || normalized.includes("failed to push some refs")
    || normalized.includes("tip of your current branch is behind")
    || normalized.includes("fetch first");
}

function parseGithubRemote(raw: string | null): { host: string; owner: string; repo: string } | null {
  const parsed = parseGitRemote(raw);
  if (!parsed || parsed.provider !== "github" || !parsed.owner) return null;
  return { host: parsed.host, owner: parsed.owner, repo: parsed.repo };
}

function buildGhRepoFlag(remote: { owner: string; repo: string } | null): string {
  return remote ? ` --repo "${remote.owner}/${remote.repo}"` : "";
}

export function parseGitRemote(raw: string | null): ParsedRemote | null {
  if (!raw) return null;

  const normalized = raw
    .trim()
    .replace(/\.git$/, "")
    .replace(/^git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/(.+)$/, "https://dev.azure.com/$1/$2/_git/$3")
    .replace(/^git@([^:]+):(.+)$/, "https://$1/$2")
    .replace(/^ssh:\/\/git@([^/]+)\/(.+)$/, "https://$1/$2");

  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);

    if (host.includes("github")) {
      if (parts.length < 2) return null;
      return {
        provider: "github",
        host,
        normalizedUrl: `https://${host}/${parts[0]}/${parts[1]}`,
        owner: parts[0],
        repo: parts[1]!,
      };
    }

    if (host === "dev.azure.com") {
      if (parts.length < 4 || parts[2] !== "_git") return null;
      return {
        provider: "azure-devops",
        host,
        normalizedUrl: `https://${host}/${parts[0]}/${parts[1]}/_git/${parts[3]}`,
        organization: parts[0],
        project: parts[1],
        repo: parts[3]!,
      };
    }

    if (host.endsWith(".visualstudio.com")) {
      if (parts.length < 3 || parts[1] !== "_git") return null;
      return {
        provider: "azure-devops",
        host,
        normalizedUrl: `https://${host}/${parts[0]}/_git/${parts[2]}`,
        organization: host.replace(/\.visualstudio\.com$/, ""),
        project: parts[0],
        repo: parts[2]!,
      };
    }

    if (host.includes("gitlab")) {
      if (parts.length < 2) return null;
      return {
        provider: "gitlab",
        host,
        normalizedUrl: `https://${host}/${parts.join("/")}`,
        owner: parts.slice(0, -1).join("/"),
        repo: parts[parts.length - 1]!,
      };
    }

    if (host.includes("bitbucket")) {
      if (parts.length < 2) return null;
      return {
        provider: "bitbucket",
        host,
        normalizedUrl: `https://${host}/${parts[0]}/${parts[1]}`,
        owner: parts[0],
        repo: parts[1]!,
      };
    }

    if (host.includes("gitea")) {
      if (parts.length < 2) return null;
      return {
        provider: "gitea",
        host,
        normalizedUrl: `https://${host}/${parts[0]}/${parts[1]}`,
        owner: parts[0],
        repo: parts[1]!,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function detectGitRemoteProvider(raw: string | null): GitRemoteProvider {
  return parseGitRemote(raw)?.provider ?? (raw ? "unknown" : "none");
}

function resolveGithubToken(explicit?: string): string | null {
  return explicit ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? process.env.GITHUB_PAT ?? null;
}

/** Cache for git credential manager token (avoids shelling out every request). */
let _gitCredentialToken: string | null | undefined;
let _gitCredentialExpiry = 0;

/**
 * Attempt to extract a GitHub token from git's credential manager.
 * Returns null if git credential fill fails or isn't configured.
 * Caches the result for 5 minutes to avoid repeated subprocess calls.
 */
async function resolveGitCredentialToken(): Promise<string | null> {
  if (_gitCredentialToken !== undefined && Date.now() < _gitCredentialExpiry) {
    return _gitCredentialToken;
  }
  try {
    const { spawn } = await import("node:child_process");
    const token = await new Promise<string | null>((resolve) => {
      const proc = spawn("git", ["credential", "fill"], { timeout: 5_000, windowsHide: true });
      let out = "";
      proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
      proc.on("close", () => {
        const match = out.match(/^password=(.+)$/m);
        resolve(match?.[1]?.trim() ?? null);
      });
      proc.on("error", () => resolve(null));
      proc.stdin.write("protocol=https\nhost=github.com\n\n");
      proc.stdin.end();
    });
    _gitCredentialToken = token;
  } catch {
    _gitCredentialToken = null;
  }
  _gitCredentialExpiry = Date.now() + 5 * 60 * 1000;
  return _gitCredentialToken;
}

/**
 * Resolve a usable GitHub token — explicit > env > git credential manager.
 */
async function resolveGithubTokenWithFallback(explicit?: string): Promise<string | null> {
  const quick = resolveGithubToken(explicit);
  if (quick) return quick;
  return resolveGitCredentialToken();
}

async function azAvailable(cwd: string): Promise<boolean> {
  try {
    await exec("az version", { cwd, timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

async function azExec(cwd: string, args: string, timeout = DEFAULT_TIMEOUT): Promise<string> {
  const { stdout } = await exec(`az ${args}`, { cwd, timeout });
  return trimCommandOutput(stdout);
}

// ── Service ────────────────────────────────────────────────────────

export class GitService {
  async isRepo(cwd: string): Promise<boolean> {
    return IS_REPO_MEMO(repoMemoKey(cwd), async () => {
      try {
        await gitExec(cwd, "rev-parse --is-inside-work-tree");
        return true;
      } catch {
        return false;
      }
    });
  }

  async init(cwd: string): Promise<void> {
    await gitExec(cwd, "init");
    invalidateGitRepoMemo(cwd);
  }

  async getIdentity(cwd: string): Promise<GitIdentity> {
    const [name, email] = await Promise.all([
      gitExec(cwd, "config --get user.name").catch(() => ""),
      gitExec(cwd, "config --get user.email").catch(() => ""),
    ]);

    return {
      name: name.trim() || null,
      email: email.trim() || null,
    };
  }

  async setIdentity(cwd: string, name: string, email: string): Promise<GitIdentity> {
    const safeName = name.replace(/"/g, '\\"');
    const safeEmail = email.replace(/"/g, '\\"');
    await gitExec(cwd, `config user.name "${safeName}"`);
    await gitExec(cwd, `config user.email "${safeEmail}"`);
    return this.getIdentity(cwd);
  }

  async status(cwd: string, requestedBranch?: string, githubToken?: string): Promise<GitStatusResult> {
    // Coalesce the many same-second pollers (badge, HUD, panel, watcher, N
    // clients) onto one git pass. Any write to the repo drops this entry.
    const key = repoFactKey(cwd, `status${GIT_FACT_SEP}${requestedBranch ?? ""}`);
    const result = await STATUS_MEMO(key, () => this.computeStatus(cwd, requestedBranch, githubToken));
    return result ?? EMPTY_STATUS;
  }

  private async computeStatus(cwd: string, requestedBranch?: string, githubToken?: string): Promise<GitStatusResult | null> {
    const effectiveToken = await resolveGithubTokenWithFallback(githubToken);
    const isGit = await this.isRepo(cwd);
    if (!isGit) return null;

    // Branch
    let branch: string | null = null;
    try {
      branch = await gitExec(cwd, "rev-parse --abbrev-ref HEAD");
      if (branch === "HEAD") branch = null;
    } catch { /* detached HEAD */ }

    // NUL delimiters preserve spaces, tabs, newlines and rename destinations.
    // Enumerate untracked files individually so consumers never need full diffs
    // just to discover files inside new directories.
    const porcelain = await gitExec(cwd, "status --porcelain -z --untracked-files=all");
    const hasChanges = porcelain.length > 0;
    const indexStatusMap = new Map<string, string>();
    const workingTreeStatusMap = new Map<string, string>();
    const records = porcelain.split("\0");
    for (let i = 0; i < records.length; i++) {
      const record = records[i]!;
      if (!record) continue;
      const xy = record.slice(0, 2);
      const fp = record.slice(3);
      if (xy.includes("R") || xy.includes("C")) i++; // source follows destination
      if (xy === "??") workingTreeStatusMap.set(fp, "?");
      else {
        if (xy[0] !== " ") indexStatusMap.set(fp, normalizeStatusChar(xy[0]!));
        if (xy[1] !== " ") workingTreeStatusMap.set(fp, normalizeStatusChar(xy[1]!));
      }
    }

    const readStats = (output: string, statuses: Map<string, string>): GitStatusFile[] => {
      const stats = new Map<string, { insertions: number; deletions: number }>();
      const records = output.split("\0");
      for (let i = 0; i < records.length; i++) {
        const record = records[i]!;
        if (!record) continue;
        const firstTab = record.indexOf("\t");
        const secondTab = record.indexOf("\t", firstTab + 1);
        if (firstTab < 0 || secondTab < 0) continue;
        let path = record.slice(secondTab + 1);
        if (!path) { i++; path = records[++i] ?? ""; } // rename: old\0new\0
        stats.set(path, {
          insertions: Number.parseInt(record.slice(0, firstTab), 10) || 0,
          deletions: Number.parseInt(record.slice(firstTab + 1, secondTab), 10) || 0,
        });
      }
      return [...statuses].map(([path, status]) => ({ path, status, ...(stats.get(path) ?? { insertions: 0, deletions: 0 }) }));
    };
    // Independent index and working-tree diffs run together; clean sides cost
    // no subprocess. Building from status also retains zero-line mode changes.
    const [indexStat, workingTreeStat] = await Promise.all([
      indexStatusMap.size ? gitExec(cwd, "diff --cached --numstat -z") : Promise.resolve(""),
      [...workingTreeStatusMap.values()].some(status => status !== "?") ? gitExec(cwd, "diff --numstat -z") : Promise.resolve(""),
    ]);
    const indexFiles = readStats(indexStat, indexStatusMap);
    const workingTreeFiles = readStats(workingTreeStat, workingTreeStatusMap);
    const indexInsertions = indexFiles.reduce((total, file) => total + file.insertions, 0);
    const indexDeletions = indexFiles.reduce((total, file) => total + file.deletions, 0);
    const workingTreeInsertions = workingTreeFiles.reduce((total, file) => total + file.insertions, 0);
    const workingTreeDeletions = workingTreeFiles.reduce((total, file) => total + file.deletions, 0);

    // Upstream tracking
    let hasUpstream = false;
    let aheadCount = 0;
    let behindCount = 0;
    if (branch) {
      const upstream = await getBranchUpstream(cwd, branch);
      if (upstream) {
        hasUpstream = !!upstream;
        const counts = await gitExec(cwd, `rev-list --left-right --count ${branch}...${upstream}`);
        const [ahead, behind] = counts.split("\t").map(Number);
        aheadCount = ahead ?? 0;
        behindCount = behind ?? 0;
      }
    }

    // PR status (via gh cli)
    let pr: GitStatusPr | null = null;
    let ghIsAvailable = false;
    const prBranch = requestedBranch ?? branch;
    let remoteUrl: string | null = null;
    let prProvider: GitRemoteProvider = "none";
    let githubRemote: ReturnType<typeof parseGithubRemote> = null;
    try {
      const preferredRemote = await this.getPreferredRemote(cwd, branch ?? undefined);
      remoteUrl = await this.getRemoteUrl(cwd, preferredRemote ?? "origin");
      prProvider = detectGitRemoteProvider(remoteUrl);
      githubRemote = parseGithubRemote(remoteUrl);
    } catch { /* no remote */ }
    if (prBranch) {
      try {
        const hasGh = await ghAvailable(cwd);
        ghIsAvailable = hasGh;
        if (hasGh) {
          const json = await ghExec(
            cwd,
            `pr view --head "${prBranch}"${buildGhRepoFlag(githubRemote)} --json number,title,url,state,baseRefName,headRefName`,
          );
          if (json) {
            const parsed = JSON.parse(json) as Record<string, unknown>;
            if (parsed.number) {
              const state = String(parsed.state ?? "OPEN").toUpperCase();
              pr = {
                number: Number(parsed.number),
                title: String(parsed.title ?? ""),
                url: String(parsed.url ?? ""),
                baseBranch: String(parsed.baseRefName ?? ""),
                headBranch: String(parsed.headRefName ?? ""),
                state: state === "MERGED" ? "merged" : state === "CLOSED" ? "closed" : "open",
              };
            }
          }
        } else {
          if (effectiveToken) {
            if (githubRemote) {
              const apiPr = await this.fetchGithubPrByHead(githubRemote, effectiveToken, prBranch);
              if (apiPr) pr = apiPr;
            }
          }
        }
      } catch { /* gh not available or no PR */ }
    }

    return {
      branch,
      hasWorkingTreeChanges: hasChanges,
      index: { files: indexFiles, insertions: indexInsertions, deletions: indexDeletions },
      workingTree: { files: workingTreeFiles, insertions: workingTreeInsertions, deletions: workingTreeDeletions },
      hasUpstream,
      aheadCount,
      behindCount,
      pr,
      ghAvailable: ghIsAvailable,
      prProvider,
      remoteUrl,
    };
  }

  /** Fetch CI check statuses for a PR branch via `gh pr checks`. */
  async prChecks(cwd: string, branch: string): Promise<PrCheck[]> {
    try {
      const hasGh = await ghAvailable(cwd);
      if (!hasGh) return [];
      const remoteName = await this.getPreferredRemote(cwd, branch);
      const remoteUrl = await this.getRemoteUrl(cwd, remoteName ?? "");
      const githubRemote = parseGithubRemote(remoteUrl);
      const json = await ghExec(cwd, `pr checks "${branch}"${buildGhRepoFlag(githubRemote)} --json name,state,conclusion,startedAt,completedAt,detailsUrl`);
      if (!json) return [];
      return JSON.parse(json) as PrCheck[];
    } catch {
      return [];
    }
  }

  async listBranches(cwd: string): Promise<GitListBranchesResult> {
    const isGit = await this.isRepo(cwd);
    if (!isGit) return { branches: [], isRepo: false };
    return BRANCH_LIST_MEMO(repoFactKey(cwd, "branch-list"), () => this.computeListBranches(cwd));
  }

  private async computeListBranches(cwd: string): Promise<GitListBranchesResult> {
    try {
      const raw = await gitExec(cwd, "branch -a --format='%(HEAD) %(refname:short) %(upstream:short) %(worktreepath)'");
      const branches: GitBranch[] = [];
      const remotes = await this.listRemotes(cwd);
      const remoteSet = new Set(remotes);
      const preferredRemote = await this.getPreferredRemote(cwd);
      const defaultBranch = await gitExec(cwd, `symbolic-ref refs/remotes/${preferredRemote ?? "origin"}/HEAD`)
        .then((r) => r.replace(`refs/remotes/${preferredRemote ?? "origin"}/`, "").trim())
        .catch(() => "main");

      for (const line of raw.split("\n").filter(Boolean)) {
        const clean = line.replace(/^'|'$/g, "").trim();
        const current = clean.startsWith("*");
        const parts = clean.replace(/^\*?\s*/, "").split(/\s+/);
        const name = parts[0] ?? "";
        const slashIndex = name.indexOf("/");
        const remoteName = slashIndex > 0 ? name.slice(0, slashIndex) : "";
        const isRemote = !!remoteName && remoteSet.has(remoteName);
        const branchName = isRemote ? name.slice(slashIndex + 1) : name;
        const worktreePath = parts.length > 2 ? parts.slice(2).join(" ") || null : null;
        if (!name || (isRemote && branchName === "HEAD")) continue;
        branches.push({
          name: branchName,
          isRemote,
          current,
          isDefault:
            branchName === defaultBranch ||
            (isRemote && remoteName === preferredRemote && name === `${preferredRemote}/${defaultBranch}`),
          worktreePath,
        });
      }

      return { branches, isRepo: true };
    } catch {
      return { branches: [], isRepo: true };
    }
  }

  async pull(cwd: string): Promise<GitPullResult> {
    const branch = await gitExec(cwd, "rev-parse --abbrev-ref HEAD");
    let upstream: string | null = null;
    try {
      upstream = await gitExec(cwd, `rev-parse --abbrev-ref ${branch}@{upstream}`);
    } catch { /* no upstream */ }

    const before = await gitExec(cwd, "rev-parse HEAD");
    await gitExec(cwd, "pull --rebase");
    const after = await gitExec(cwd, "rev-parse HEAD");

    return {
      status: before === after ? "skipped_up_to_date" : "pulled",
      branch,
      upstreamBranch: upstream,
    };
  }

  async bumpProjectPackageVersions(cwd: string): Promise<GitVersionBumpResult> {
    const candidateFiles = [
      join(cwd, "package.json"),
      ...await listChildPackageJsonFiles(join(cwd, "packages")),
      ...await listChildPackageJsonFiles(join(cwd, "apps")),
    ];
    const files = candidateFiles.filter((file, index) => candidateFiles.indexOf(file) === index);
    const updatedFiles: string[] = [];
    let previousVersion: string | null = null;
    let nextVersion: string | null = null;

    for (const file of files) {
      if (!existsSync(file)) continue;
      const raw = await readFile(file, "utf-8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const currentVersion = typeof parsed["version"] === "string" ? parsed["version"].trim() : "";
      if (!currentVersion) continue;
      const bumped = bumpPatchVersion(currentVersion);
      if (!bumped) continue;
      parsed["version"] = bumped;
      await writeFile(file, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
      updatedFiles.push(file);
      if (!previousVersion) previousVersion = currentVersion;
      if (!nextVersion) nextVersion = bumped;
    }

    if (!previousVersion || !nextVersion || updatedFiles.length === 0) {
      throw new Error("No bumpable package.json version fields found in this project.");
    }

    return {
      previousVersion,
      nextVersion,
      files: updatedFiles,
    };
  }

  async runVersionBumpCommitPushFlow(cwd: string, githubToken?: string): Promise<GitCommitFlowResult> {
    const statusBefore = await this.status(cwd, undefined, githubToken);
    let sync: GitCommitFlowResult["sync"] = {
      status: "skipped_no_upstream",
      branch: statusBefore.branch,
      upstreamBranch: null,
    };

    if (statusBefore.branch && statusBefore.hasUpstream) {
      let upstreamBranch: string | null = null;
      try {
        upstreamBranch = await gitExec(cwd, `rev-parse --abbrev-ref ${statusBefore.branch}@{upstream}`);
      } catch {
        upstreamBranch = null;
      }
      if (statusBefore.behindCount > 0) {
        try {
          await gitExec(cwd, "pull --rebase --autostash");
          sync = { status: "pulled", branch: statusBefore.branch, upstreamBranch };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          throw new Error(`Pull before push failed. Resolve the rebase conflict and retry. ${message}`);
        }
      } else {
        sync = { status: "skipped_up_to_date", branch: statusBefore.branch, upstreamBranch };
      }
    }

    const version = await this.bumpProjectPackageVersions(cwd);
    const commitMessage = `chore: bump version to v${version.nextVersion}`;
    const git = await this.runStackedAction(cwd, "commit_push", commitMessage, false, undefined, githubToken);

    if (git.push.status === "failed" && isNonFastForwardPushError(git.push.error ?? "")) {
      try {
        await gitExec(cwd, "pull --rebase --autostash");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Push was rejected and pull --rebase failed. Resolve the conflict and retry. ${message}`);
      }

      const branch = await gitExec(cwd, "rev-parse --abbrev-ref HEAD").catch(() => null);
      if (!branch) {
        throw new Error("Push retry failed because the current branch could not be determined.");
      }
      try {
        await gitExec(cwd, "push --no-verify");
        git.push = {
          status: "pushed",
          branch,
          upstreamBranch: git.push.upstreamBranch,
          error: undefined,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Push retry failed after pulling latest changes. ${message}`);
      }
    } else if (git.push.status === "failed") {
      throw new Error(git.push.error ?? "Push failed");
    }

    return { version, sync, git };
  }

  async sync(cwd: string): Promise<GitSyncResult> {
    const branch = await gitExec(cwd, "rev-parse --abbrev-ref HEAD");
    const upstream = await getBranchUpstream(cwd, branch);

    const result: GitSyncResult = {
      branch,
      upstreamBranch: upstream,
      pull: { status: upstream ? "skipped_up_to_date" : "skipped_no_upstream" },
      push: { status: "skipped_up_to_date" },
    };

    if (upstream) {
      const before = await gitExec(cwd, "rev-parse HEAD");
      await gitExec(cwd, "pull --rebase");
      const after = await gitExec(cwd, "rev-parse HEAD");
      result.pull = { status: before === after ? "skipped_up_to_date" : "pulled" };

      const aheadCount = Number.parseInt(await gitExec(cwd, "rev-list --count @{upstream}..HEAD").catch(() => "0"), 10);
      if (Number.isFinite(aheadCount) && aheadCount > 0) {
        await gitExec(cwd, "push --no-verify");
        result.push = { status: "pushed" };
      }

      return result;
    }

    const remoteName = await this.getPreferredRemote(cwd, branch);
    if (!remoteName) {
      result.push = { status: "skipped_no_remote" };
      return result;
    }

    await gitExec(cwd, `push --no-verify --set-upstream "${remoteName}" "${branch}"`);
    result.upstreamBranch = `${remoteName}/${branch}`;
    result.push = { status: "pushed" };
    return result;
  }

  async fetch(cwd: string, allRemotes = false): Promise<GitFetchResult> {
    let remote: string | null = null;
    try {
      remote = await this.getPreferredRemote(cwd);
    } catch {
      remote = null;
    }

    if (!allRemotes && !remote) {
      return {
        status: "skipped_no_remote",
        remote: null,
        allRemotes: false,
      };
    }

    if (allRemotes) {
      await gitExec(cwd, "fetch --all");
    } else {
      await gitExec(cwd, `fetch "${remote}"`);
    }

    return {
      status: "fetched",
      remote,
      allRemotes,
    };
  }

  /** Discard working-tree changes for specific files, or all files if paths is empty. */
  async discardChanges(cwd: string, paths?: string[]): Promise<{ discardedCount: number }> {
    if (!paths || paths.length === 0) {
      // Discard all staged + unstaged tracked changes, then remove untracked files.
      await gitExec(cwd, "reset --hard HEAD");
      await gitExec(cwd, "clean -fd");
      return { discardedCount: -1 }; // -1 means "all"
    }
    let count = 0;
    for (const p of paths) {
      // Sanitize: reject filenames with shell-unsafe chars
      if (/[;&|`$]/.test(p)) continue;
      try {
        // Reset the index first so staged-only and mixed staged/unstaged paths fully discard.
        await gitExec(cwd, `reset HEAD -- "${p}"`);
        // Then restore the working tree for tracked files.
        await gitExec(cwd, `checkout -- "${p}"`);
        count++;
      } catch {
        // If restore fails, the path may now be untracked (e.g. staged add) or already absent.
        try {
          await gitExec(cwd, `clean -fd -- "${p}"`);
          count++;
        } catch { /* file may not exist */ }
      }
    }
    return { discardedCount: count };
  }

  /** Stage specific files, or all if paths is empty. */
  async stage(cwd: string, paths?: string[]): Promise<void> {
    if (!paths || paths.length === 0) {
      await gitExec(cwd, "add -A");
      return;
    }
    for (const p of paths) {
      if (/[;&|`$]/.test(p)) continue;
      await gitExec(cwd, `add "${p}"`);
    }
  }

  /** Unstage specific files, or all if paths is empty. */
  async unstage(cwd: string, paths?: string[]): Promise<void> {
    if (!paths || paths.length === 0) {
      await gitExec(cwd, "reset HEAD");
      return;
    }
    for (const p of paths) {
      if (/[;&|`$]/.test(p)) continue;
      await gitExec(cwd, `reset HEAD -- "${p}"`);
    }
  }

  async runStackedAction(
    cwd: string,
    action: GitStackedAction,
    commitMessage?: string,
    featureBranch?: boolean,
    baseBranch?: string,
    githubToken?: string,
    expectedBranch?: string,
  ): Promise<GitStepResult> {
    const effectiveToken = await resolveGithubTokenWithFallback(githubToken);
    const result: GitStepResult = {
      commit: { status: "skipped_no_changes" },
      push: { status: "skipped_not_requested" },
      branch: { status: "skipped_not_requested" },
      pr: { status: "skipped_not_requested" },
    };
    let resolvedBaseBranch: string | undefined;
    const resolvePrBaseBranch = async (branch?: string | null): Promise<string> => {
      if (resolvedBaseBranch) return resolvedBaseBranch;
      const explicitBase = baseBranch?.trim();
      if (explicitBase) {
        resolvedBaseBranch = explicitBase;
        return resolvedBaseBranch;
      }
      const remote = await this.getPreferredRemote(cwd, branch ?? undefined).catch(() => null);
      const remoteUrl = remote ? await this.getRemoteUrl(cwd, remote).catch(() => null) : null;
      resolvedBaseBranch = await this.resolveDefaultBranch(cwd, remoteUrl);
      return resolvedBaseBranch;
    };

    // Before creating a feature branch, push the base branch to remote if it
    // has unpushed commits.  Otherwise the feature branch inherits those
    // commits and the PR diff on GitHub includes changes that belong to main.
    if (
      (action === "commit_push" || action === "commit_push_pr") &&
      (featureBranch || expectedBranch)
    ) {
      const preBranch = await gitExec(cwd, "rev-parse --abbrev-ref HEAD").catch(() => null);
      const targetBase = await resolvePrBaseBranch(preBranch);
      if (preBranch === targetBase) {
        try {
          const remote = await this.getPreferredRemote(cwd, preBranch).catch(() => null);
          if (remote) {
            await gitExec(cwd, `fetch ${remote} ${targetBase}`, 60_000);
            const ahead = await gitExec(cwd, `rev-list --count ${remote}/${targetBase}..HEAD`).catch(() => "0");
            if (parseInt(ahead, 10) > 0) {
              await gitExec(cwd, `push --no-verify "${remote}" "${preBranch}"`);
            }
          }
        } catch {
          // Push failed (e.g. protected branch, conflict) — continue anyway.
          // The feature branch may carry extra commits in the PR diff.
        }
      }
    }

    // Optionally create a feature branch
    if (featureBranch) {
      const timestamp = Date.now().toString(36);
      const branchName = `feature/auto-${timestamp}`;
      await gitExec(cwd, `checkout -b "${branchName}"`);
      result.branch = { status: "created", name: branchName };
    }

    let currentBranch = await gitExec(cwd, "rev-parse --abbrev-ref HEAD").catch(() => null);

    // If we expect a specific branch (e.g. thread branch) but are on a different one
    // (e.g. main because worktree creation failed), switch to it before committing.
    if (expectedBranch && currentBranch && currentBranch !== expectedBranch) {
      try {
        // Try to checkout the expected branch (it may already exist locally)
        await gitExec(cwd, `checkout "${expectedBranch}"`);
        currentBranch = expectedBranch;
      } catch {
        try {
          // Branch doesn't exist locally — create it from current HEAD
          await gitExec(cwd, `checkout -b "${expectedBranch}"`);
          currentBranch = expectedBranch;
        } catch {
          // Last resort: stay on current branch
        }
      }
    }

    // Commit step. Honor the user's staging: if anything is already staged,
    // commit exactly those staged files and leave unstaged/untracked changes
    // alone. Otherwise, stage all changes (excluding local release checkouts)
    // and commit them. Without this, `git add -A` + `commit -- <pathspec>`
    // would sweep every unstaged change into the commit and push it.
    const stagedPaths = await gitExec(cwd, `diff --cached --name-only ${COMMITTABLE_PATHSPEC}`).catch(() => "");
    const hasStaged = stagedPaths.trim().length > 0;
    const hasWorkingChanges =
      hasStaged ||
      (await gitExec(cwd, `status --porcelain ${COMMITTABLE_PATHSPEC}`).catch(() => "")).length > 0;
    if (hasWorkingChanges) {
      // Only stage everything when the user hasn't staged anything yet.
      if (!hasStaged) {
        await gitExec(cwd, `add -A ${COMMITTABLE_PATHSPEC}`);
      }

      try {
        let msg = commitMessage?.trim();
        if (!msg) {
          // Auto-generate a commit message from the diff summary
          try {
            const diffSummary = await gitExec(cwd, `diff --cached --stat ${COMMITTABLE_PATHSPEC}`);
            msg = `chore: auto-commit ${diffSummary.split("\n").length} file(s) changed`;
          } catch {
            msg = "chore: auto-commit changes";
          }
        }

        // Commit the whole index (i.e. exactly the staged content). A pathspec
        // here would commit the *working-tree* content of matching files,
        // which is what swept in the unstaged changes in the first place.
        await gitExec(cwd, `commit -m "${msg.replace(/"/g, '\\"')}"`);
        const sha = await gitExec(cwd, "rev-parse HEAD");
        result.commit = { status: "created", commitSha: sha, subject: msg };
      } catch (err) {
        // Unstage so we don't leave stale staged files behind
        await gitExec(cwd, `reset HEAD ${COMMITTABLE_PATHSPEC}`).catch(() => {});
        throw err;
      }
    }

    // Push step
    if (action === "commit_push" || action === "commit_push_pr") {
      if (currentBranch) {
        let hasUpstream = false;
        let upstreamBranch: string | undefined;
        upstreamBranch = await getBranchUpstream(cwd, currentBranch) ?? undefined;
        if (upstreamBranch) {
          hasUpstream = true;
        }

        // Rebase onto the latest remote base branch so PRs show a clean diff.
        // Without this, the branch may be rooted on a stale commit and GitHub
        // shows the entire delta between that old base and current main.
        try {
          const rebaseTarget = await resolvePrBaseBranch(currentBranch);
          const rebaseRemote = await this.getPreferredRemote(cwd, currentBranch).catch(() => null);
          if (rebaseRemote) {
            await gitExec(cwd, `fetch ${rebaseRemote} ${rebaseTarget}`, 60_000);
            await gitExec(cwd, `rebase ${rebaseRemote}/${rebaseTarget}`);
          }
        } catch {
          // Abort if rebase has conflicts — push from current state
          await gitExec(cwd, "rebase --abort").catch(() => {});
        }

        if (hasUpstream) {
          try {
            await gitExec(cwd, "push --no-verify --force-with-lease");
            result.push = { status: "pushed", branch: currentBranch, upstreamBranch };
          } catch (pushErr) {
            const msg = pushErr instanceof Error ? pushErr.message : String(pushErr);
            result.push = { status: "failed", branch: currentBranch, upstreamBranch, error: msg };
          }
        } else {
          const remoteName = await this.getPreferredRemote(cwd, currentBranch);
          if (!remoteName) {
            result.push = { status: "skipped_no_remote", branch: currentBranch };
            // Don't return early — still try PR via gh CLI which may work
          } else {
            await gitExec(cwd, `push --no-verify --set-upstream "${remoteName}" "${currentBranch}"`);
            result.push = {
              status: "pushed",
              branch: currentBranch,
              upstreamBranch: `${remoteName}/${currentBranch}`,
              setUpstream: true,
            };
          }
        }
      }

      // Attach a "create PR" URL so the frontend can link to it
      if (result.push.status === "pushed" && currentBranch) {
        const upstreamRemote = result.push.upstreamBranch?.split("/")[0];
        result.push.createPrUrl = await this.buildCreatePrUrl(cwd, currentBranch, upstreamRemote, await resolvePrBaseBranch(currentBranch));
      }
    }

    // PR creation step — try even if push was skipped (gh CLI can push internally)
    if (action === "commit_push_pr" && currentBranch) {
      try {
        const hasGh = await ghAvailable(cwd);
        const preferredRemote = await this.getPreferredRemote(cwd, currentBranch);
        const remoteUrl = await this.getRemoteUrl(cwd, preferredRemote ?? "");
        const parsedRemote = parseGitRemote(remoteUrl);
        const githubRemote = parseGithubRemote(remoteUrl);
        const resolvedBase = await resolvePrBaseBranch(currentBranch);
        const manualUrl = result.push.createPrUrl ?? (preferredRemote
          ? await this.buildCreatePrUrl(cwd, currentBranch, preferredRemote, resolvedBase)
          : undefined);

        if (parsedRemote?.provider === "github" && !hasGh && !effectiveToken) {
          const hint = manualUrl ? ` Open ${manualUrl} to create the PR manually.` : "";
          throw new Error(`Cannot create pull request automatically because GitHub CLI is not installed and no GITHUB_TOKEN is configured.${hint}`);
        }

        if (parsedRemote?.provider === "github" && hasGh) {
          // Check if PR already exists
          try {
            const existing = await ghExec(
              cwd,
              `pr view --head "${currentBranch}"${buildGhRepoFlag(githubRemote)} --json number,url,title,state,baseRefName,headRefName`,
            );
            const parsed = JSON.parse(existing) as Record<string, unknown>;
            if (parsed.number) {
              const state = String(parsed.state ?? "OPEN").toUpperCase();
              if (state === "OPEN") {
                result.pr = {
                  status: "opened_existing",
                  url: String(parsed.url ?? ""),
                  number: Number(parsed.number),
                  baseBranch: String(parsed.baseRefName ?? ""),
                  headBranch: String(parsed.headRefName ?? ""),
                  title: String(parsed.title ?? ""),
                };
                return result;
              }
            }
          } catch { /* no existing PR */ }

          // Create new PR
          const prTitle = result.commit.subject ?? commitMessage?.trim() ?? `Changes from ${currentBranch}`;
          const baseFlag = ` --base "${resolvedBase}"`;

          // If the branch wasn't pushed yet, push it now before creating the PR
          if (result.push.status !== "pushed") {
            try {
              const remoteName = await this.getPreferredRemote(cwd, currentBranch);
              if (remoteName) {
                await gitExec(cwd, `push --no-verify --set-upstream "${remoteName}" "${currentBranch}"`);
                result.push = { status: "pushed", branch: currentBranch, upstreamBranch: `${remoteName}/${currentBranch}`, setUpstream: true };
              }
            } catch { /* push failed — gh pr create may still succeed */ }
          }

          // Generate PR body from diff context
          const prBody = await this.generatePrBody(cwd, resolvedBase, currentBranch, prTitle);

          // Write body to temp file (avoids shell escaping issues with markdown)
          const bodyFile = join(tmpdir(), `jait-pr-body-${Date.now()}.md`);
          await writeFile(bodyFile, prBody, "utf-8");

          try {
            // gh pr create outputs the PR URL on stdout (--json is not supported)
            const prUrl = await ghExec(
              cwd,
              `pr create --head "${currentBranch}"${buildGhRepoFlag(githubRemote)} --title "${prTitle.replace(/"/g, '\\"')}" --body-file "${bodyFile}"${baseFlag}`,
              60_000,
            );

            // Fetch full PR details via gh pr view
            let prNumber = 0;
            let prBaseBranch = resolvedBase;
            let prHeadBranch = currentBranch;
            let prFinalTitle = prTitle;
            try {
              const details = await ghExec(
                cwd,
                `pr view "${prUrl.trim()}" --json number,title,baseRefName,headRefName`,
              );
              const parsed = JSON.parse(details) as Record<string, unknown>;
              prNumber = Number(parsed.number ?? 0);
              prBaseBranch = String(parsed.baseRefName ?? prBaseBranch);
              prHeadBranch = String(parsed.headRefName ?? prHeadBranch);
              prFinalTitle = String(parsed.title ?? prTitle);
            } catch { /* details fetch failed — use what we have */ }

            result.pr = {
              status: "created",
              url: prUrl.trim(),
              number: prNumber,
              baseBranch: prBaseBranch,
              headBranch: prHeadBranch,
              title: prFinalTitle,
            };
            // If gh pushed the branch for us, update push status
            if (result.push.status !== "pushed") {
              result.push = { status: "pushed", branch: currentBranch };
            }
          } finally {
            // Clean up temp file
            await unlink(bodyFile).catch(() => {});
          }
        } else if (parsedRemote?.provider === "github" && githubRemote && effectiveToken) {
          const prTitle = result.commit.subject ?? commitMessage?.trim() ?? `Changes from ${currentBranch}`;
          const prBody = await this.generatePrBody(cwd, resolvedBase, currentBranch, prTitle);
          const apiResult = await this.createGithubPrViaApi(githubRemote, effectiveToken, {
            title: prTitle,
            baseBranch: resolvedBase,
            headBranch: currentBranch,
            body: prBody,
          });

          result.pr = {
            status: apiResult.status,
            url: apiResult.url,
            number: apiResult.number,
            baseBranch: apiResult.baseBranch,
            headBranch: apiResult.headBranch,
            title: apiResult.title,
          };
        } else if (parsedRemote?.provider === "azure-devops") {
          const azureRemote = parsedRemote as ParsedRemote & { provider: "azure-devops" };
          const prTitle = result.commit.subject ?? commitMessage?.trim() ?? `Changes from ${currentBranch}`;
          const prBody = await this.generatePrBody(cwd, resolvedBase, currentBranch, prTitle);
          let apiResult: GitStepResult["pr"] | null = null;
          try {
            apiResult = await this.createAzureDevopsPr(azureRemote, cwd, {
              title: prTitle,
              baseBranch: resolvedBase,
              headBranch: currentBranch,
              body: prBody,
            });
          } catch {
            apiResult = null;
          }

          result.pr = apiResult ?? {
            status: "skipped_no_remote",
            ...(manualUrl ? { url: manualUrl } : {}),
            baseBranch: resolvedBase,
            headBranch: currentBranch,
            title: prTitle,
          };
        } else {
          result.pr = manualUrl
            ? {
                status: "skipped_no_remote",
                url: manualUrl,
                baseBranch: resolvedBase,
                headBranch: currentBranch,
                title: result.commit.subject ?? commitMessage?.trim() ?? `Changes from ${currentBranch}`,
              }
            : { status: "skipped_not_requested" };
        }
      } catch (err) {
        // PR creation failed — report as error with details
        const errMsg = err instanceof Error ? err.message : String(err);
        result.pr = { status: "skipped_no_remote" };
        const prefix = result.push.status === "skipped_no_remote"
          ? "Push failed (no remote configured) and PR creation failed"
          : "Pull request creation failed";
        throw new Error(`${prefix}: ${errMsg}`);
      }
    }

    return result;
  }

  async checkout(cwd: string, branch: string): Promise<void> {
    await gitExec(cwd, `checkout "${branch}"`);
  }

  async createBranch(cwd: string, branch: string): Promise<void> {
    await gitExec(cwd, `checkout -b "${branch}"`);
  }

  /** Delete a local branch. No-ops if the branch doesn't exist. */
  async deleteBranch(cwd: string, branch: string): Promise<void> {
    try {
      await gitExec(cwd, `branch -D "${branch}"`);
    } catch { /* branch may already be gone */ }
  }

  // ── Clone operations ──────────────────────────────────────────

  /**
   * Clone a GitHub repo to a local path for gateway-side operation.
   * Clones live under ~/.jait/clones/{repoName}.
   * If the clone already exists, fetches the latest instead.
   * Returns the path to the clone.
   */
  async cloneOrFetch(
    repoUrl: string,
    repoName: string,
    defaultBranch = "main",
    options: GitArgExecOptions = {},
  ): Promise<string> {
    if (!/^[a-zA-Z0-9._-]+$/.test(repoName) || repoName === "." || repoName === "..") {
      throw new Error("Repository name is not safe for a local clone path.");
    }

    const clonesRoot = join(getStateDirectory(), "clones");
    const clonePath = resolve(clonesRoot, repoName);
    const relativeClonePath = relative(clonesRoot, clonePath);
    if (!relativeClonePath || relativeClonePath.startsWith("..") || relativeClonePath.includes("://")) {
      throw new Error("Repository clone path escapes the configured clone directory.");
    }

    let sanitizedRepoUrl = repoUrl;
    try {
      const parsedUrl = new URL(repoUrl);
      if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
        parsedUrl.username = "";
        parsedUrl.password = "";
        sanitizedRepoUrl = parsedUrl.toString().replace(/\/$/, "");
      }
    } catch {
      // SCP-style SSH remotes are not URL-parseable and contain no HTTP credentials.
    }

    await mkdir(clonesRoot, { recursive: true });
    const cloneEntry = await lstat(clonePath).catch(() => null);
    if (cloneEntry?.isSymbolicLink()) {
      throw new Error("Repository clone path must not be a symbolic link.");
    }

    const gitEntry = await lstat(join(clonePath, ".git")).catch(() => null);
    if (gitEntry?.isSymbolicLink()) {
      throw new Error("Repository Git directory must not be a symbolic link.");
    }
    if (gitEntry && !gitEntry.isDirectory()) {
      throw new Error("Repository Git directory must be a directory.");
    }

    if (gitEntry) {
      await gitExecArgs(clonePath, ["remote", "set-url", "origin", sanitizedRepoUrl], 30_000);
      await gitExecArgs(clonePath, ["fetch", "origin"], 60_000, options);
      await gitExecArgs(
        clonePath,
        ["checkout", "--detach", `refs/remotes/origin/${defaultBranch}`],
        30_000,
      ).catch(() => {});
      await gitExecArgs(
        clonePath,
        ["reset", "--hard", `refs/remotes/origin/${defaultBranch}`],
        30_000,
      ).catch(() => {});
      return clonePath;
    }

    if (cloneEntry) {
      throw new Error("Repository clone destination already exists and is not a Git clone.");
    }

    await gitExecArgs(
      clonesRoot,
      ["clone", "--branch", defaultBranch, "--", sanitizedRepoUrl, clonePath],
      120_000,
      options,
    );
    return clonePath;
  }

  // ── Worktree operations ───────────────────────────────────────

  /**
   * Create a git worktree for a new branch.
   * Worktrees live under ~/.jait/worktrees/{repoName}/{sanitizedBranch}.
   * Uses `git worktree add -b <newBranch> <path> <baseBranch>`.
   */
  async createWorktree(
    cwd: string,
    baseBranch: string,
    newBranch: string,
    customPath?: string,
    options?: { fastPath?: boolean },
  ): Promise<GitWorktreeResult> {
    const sanitized = newBranch.replace(/\//g, "-");
    const repoName = basename(cwd);
    const worktreePath =
      customPath ??
      join(getStateDirectory(), "worktrees", repoName, sanitized);

    // Ensure parent directory exists
    await mkdir(join(worktreePath, ".."), { recursive: true });

    // Use the fast CoW path when explicitly requested, or automatically for
    // large repos where the plain `git worktree add` checkout is O(N) and slow.
    const useFast = options?.fastPath ?? (await this.isLargeRepo(cwd));
    if (useFast) {
      await this.createWorktreeFast(cwd, worktreePath, baseBranch, newBranch);
      return { path: worktreePath, branch: newBranch };
    }

    await gitExec(
      cwd,
      `worktree add -b "${newBranch}" "${worktreePath}" "${baseBranch}"`,
      60_000,
    );

    return { path: worktreePath, branch: newBranch };
  }

  /**
   * Fast worktree creation for large repos.
   *
   * Uses `git worktree add --no-checkout` (skips the slow file checkout) and
   * then populates the working tree with a copy-on-write clone of the main
   * working tree (`cp -c` on macOS APFS, `cp --reflink=auto` on Linux
   * Btrfs/XFS). CoW makes the copy near-instant and disk-cheap even for huge
   * repos, and the files are already materialized so the agent can start
   * immediately. Falls back to a plain checkout if the copy fails.
   */
  private async createWorktreeFast(
    cwd: string,
    worktreePath: string,
    baseBranch: string,
    newBranch: string,
  ): Promise<void> {
    await gitExec(
      cwd,
      `worktree add --no-checkout -b "${newBranch}" "${worktreePath}" "${baseBranch}"`,
      60_000,
    );

    // Leave the worktree's .git pointer file in place. The CoW copy excludes
    // the source repository's .git entry so a partial or failed copy cannot
    // replace that pointer with a directory and corrupt the worktree.
    const copyCmd = this.pickCopyCommand(cwd, worktreePath);
    try {
      await exec(copyCmd, { cwd });
    } catch {
      // Fall through to reset, which performs a normal checkout when the
      // opportunistic CoW copy is unavailable or interrupted.
    }

    // Align the working tree with the branch tip. When the CoW copy
    // succeeded this is a no-op for matching files; when it failed it acts
    // as a full checkout so the worktree is still usable.
    await gitExec(worktreePath, "reset --hard HEAD", 60_000).catch(() => {});
  }

  /** Pick a copy-on-write capable recursive copy command for this platform. */
  private pickCopyCommand(src: string, dst: string): string {
    const s = escapeShellArg(src);
    const d = escapeShellArg(dst);
    if (process.platform === "darwin") {
      // macOS APFS: `cp -c` uses clonefile(2) — copy-on-write, near-instant.
      return `find "${s}" -mindepth 1 -maxdepth 1 ! -name .git -exec cp -c -R {} "${d}/" \\;`;
    }
    if (process.platform === "linux") {
      // Linux Btrfs/XFS: `cp --reflink=auto` uses reflink when available and
      // falls back to a plain copy otherwise.
      return `find "${s}" -mindepth 1 -maxdepth 1 ! -name .git -exec cp --reflink=auto -R -- {} "${d}/" \\;`;
    }
    return `find "${s}" -mindepth 1 -maxdepth 1 ! -name .git -exec cp -R {} "${d}/" \\;`;
  }

  /** Remove a git worktree. */
  async removeWorktree(
    cwd: string,
    worktreePath: string,
    force = false,
  ): Promise<void> {
    const forceFlag = force ? " --force" : "";
    await gitExec(cwd, `worktree remove "${worktreePath}"${forceFlag}`, 30_000);
  }

  /**
   * Clean up a worktree directory created for a thread.
   * Resolves the main repo root, runs `git worktree remove --force`,
   * deletes the associated branch, and falls back to deleting the
   * directory if the worktree remove fails.
   * No-ops silently when the path is not a worktree or doesn't exist.
   */
  async cleanupWorktree(worktreePath: string, branch?: string | null): Promise<void> {
    return this.cleanupWorktreeWithOptions(worktreePath, {
      branch,
      preserveBranch: false,
    });
  }

  async cleanupWorktreeWithOptions(
    worktreePath: string,
    options?: { branch?: string | null; preserveBranch?: boolean },
  ): Promise<void> {
    if (!worktreePath || !existsSync(worktreePath)) return;
    // Only act on paths inside the managed worktree root. A substring check
    // would accept lookalike paths such as `/tmp/.jait/worktrees-copy`.
    if (!isManagedWorktreePath(worktreePath)) return;
    const branch = options?.branch ?? null;
    const preserveBranch = options?.preserveBranch === true;

    let mainRoot: string | undefined;
    try {
      mainRoot = await this.getMainRepoRoot(worktreePath);
      await this.removeWorktree(mainRoot, worktreePath, true);
    } catch {
      // git worktree remove may fail (dirty tree, missing refs, etc.).
      // Fall back to a plain directory removal so we don't leak disk space.
      try {
        await rm(worktreePath, { recursive: true, force: true });
      } catch { /* best effort */ }
    }

    // Delete the branch from the main repo after the worktree is gone
    if (branch && mainRoot && !preserveBranch) {
      await this.deleteBranch(mainRoot, branch);
    }
  }

  /** Get the top-level git directory (the main repo root, even from a worktree). */
  async getMainRepoRoot(cwd: string): Promise<string> {
    return MAIN_REPO_ROOT_MEMO(repoFactKey(cwd, "main-repo-root"), () => this.computeMainRepoRoot(cwd));
  }

  private async computeMainRepoRoot(cwd: string): Promise<string> {
    // In a worktree, --git-common-dir points to the main repo's .git
    // and --show-toplevel gives the worktree root. We need the main root.
    try {
      const commonDir = await gitExec(cwd, "rev-parse --git-common-dir");
      // commonDir is like /path/to/main-repo/.git
      // We want /path/to/main-repo
      if (commonDir.endsWith("/.git") || commonDir.endsWith("\\.git")) {
        return commonDir.slice(0, -5);
      }
      // Fallback: it's a regular repo
      return gitExec(cwd, "rev-parse --show-toplevel");
    } catch {
      return gitExec(cwd, "rev-parse --show-toplevel");
    }
  }

  /** Check whether a named remote (e.g. "origin") exists. */
  async hasRemote(cwd: string, name: string): Promise<boolean> {
    return HAS_REMOTE_MEMO(repoFactKey(cwd, `has-remote${GIT_FACT_SEP}${name}`), async () => {
      try {
        await gitExec(cwd, `remote get-url ${name}`);
        return true;
      } catch {
        return false;
      }
    });
  }

  /** Get the remote URL for a named remote, or null if not set. */
  async getRemoteUrl(cwd: string, name: string): Promise<string | null> {
    return REMOTE_URL_MEMO(repoFactKey(cwd, `remote-url${GIT_FACT_SEP}${name}`), async () => {
      try {
        return (await gitExec(cwd, `remote get-url ${name}`)).trim() || null;
      } catch {
        return null;
      }
    });
  }

  /** List configured remote names. */
  async listRemotes(cwd: string): Promise<string[]> {
    return REMOTE_LIST_MEMO(repoFactKey(cwd, "remotes"), async () => {
      const raw = await gitExec(cwd, "remote").catch(() => "");
      return raw
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean);
    });
  }

  /**
   * Resolve the best remote for push/PR operations.
   * Priority: branch-specific remote -> origin -> first configured remote.
   * Falls back to main repo root remotes for worktrees.
   */
  async getPreferredRemote(cwd: string, branch?: string): Promise<string | null> {
    let remotes = await this.listRemotes(cwd);

    // If no remotes found and we're in a worktree, try the main repo root
    if (remotes.length === 0) {
      try {
        const mainRoot = await this.getMainRepoRoot(cwd);
        if (mainRoot && mainRoot !== cwd) {
          remotes = await this.listRemotes(mainRoot);
        }
      } catch { /* ignore */ }
    }

    if (remotes.length === 0) return null;

    if (branch) {
      const configuredRemote = await getConfiguredBranchRemote(cwd, branch) ?? "";
      if (configuredRemote && remotes.includes(configuredRemote)) {
        return configuredRemote;
      }
    }

    if (remotes.includes("origin")) return "origin";
    return remotes[0] ?? null;
  }

  /**
   * Resolve the repository's default branch (e.g. "main" or "master").
   * Tries gh CLI first, then falls back to common defaults.
   */
  async resolveDefaultBranch(cwd: string, remoteUrl?: string | null): Promise<string> {
    const githubRemote = parseGithubRemote(remoteUrl ?? null);
    if (githubRemote) {
      try {
        const json = await ghExec(cwd, `repo view${buildGhRepoFlag(githubRemote)} --json defaultBranchRef`, 15_000);
        const parsed = JSON.parse(json) as Record<string, unknown>;
        const ref = parsed.defaultBranchRef as Record<string, unknown> | undefined;
        if (ref?.name) return String(ref.name);
      } catch { /* gh not available or github repo lookup failed */ }
    }

    // Fallback: check if "main" or "master" branches exist
    try {
      await gitExec(cwd, "rev-parse --verify refs/heads/main");
      return "main";
    } catch {
      try {
        await gitExec(cwd, "rev-parse --verify refs/heads/master");
        return "master";
      } catch {
        return "main";
      }
    }
  }

  private async createAzureDevopsPr(
    remote: ParsedRemote & { provider: "azure-devops" },
    cwd: string,
    input: { title: string; baseBranch: string; headBranch: string; body: string },
  ): Promise<GitStepResult["pr"] | null> {
    if (!await azAvailable(cwd)) return null;

    const bodyFile = join(tmpdir(), `jait-az-pr-body-${Date.now()}.md`);
    await writeFile(bodyFile, input.body, "utf-8");

    const organizationUrl = remote.host === "dev.azure.com"
      ? `https://dev.azure.com/${remote.organization}`
      : `https://${remote.host}`;

    try {
      try {
        const existingRaw = await azExec(
          cwd,
          `repos pr list --organization "${organizationUrl}" --project "${remote.project}" --repository "${remote.repo}" --source-branch "${input.headBranch}" --status active --output json`,
          30_000,
        );
        const existing = JSON.parse(existingRaw) as Array<Record<string, unknown>>;
        const first = existing[0];
        if (first) {
          const pullRequestId = Number(first.pullRequestId ?? 0);
          return {
            status: "opened_existing",
            url: this.buildAzurePrUrl(remote, pullRequestId),
            number: pullRequestId,
            baseBranch: String(first.targetRefName ?? input.baseBranch).replace(/^refs\/heads\//, ""),
            headBranch: String(first.sourceRefName ?? input.headBranch).replace(/^refs\/heads\//, ""),
            title: String(first.title ?? input.title),
          };
        }
      } catch {
        // best-effort existing PR lookup
      }

      const createdRaw = await azExec(
        cwd,
        `repos pr create --organization "${organizationUrl}" --project "${remote.project}" --repository "${remote.repo}" --source-branch "${input.headBranch}" --target-branch "${input.baseBranch}" --title "${input.title.replace(/"/g, '\\"')}" --description @"${bodyFile}" --output json`,
        60_000,
      );
      const created = JSON.parse(createdRaw) as Record<string, unknown>;
      const pullRequestId = Number(created.pullRequestId ?? 0);
      return {
        status: "created",
        url: this.buildAzurePrUrl(remote, pullRequestId),
        number: pullRequestId,
        baseBranch: String(created.targetRefName ?? input.baseBranch).replace(/^refs\/heads\//, ""),
        headBranch: String(created.sourceRefName ?? input.headBranch).replace(/^refs\/heads\//, ""),
        title: String(created.title ?? input.title),
      };
    } finally {
      await unlink(bodyFile).catch(() => {});
    }
  }

  private buildAzurePrUrl(
    remote: ParsedRemote & { provider: "azure-devops" },
    pullRequestId: number,
  ): string {
    const base = remote.host === "dev.azure.com"
      ? `https://dev.azure.com/${remote.organization}/${remote.project}/_git/${remote.repo}`
      : `https://${remote.host}/${remote.project}/_git/${remote.repo}`;
    return `${base}/pullrequest/${pullRequestId}`;
  }

  private async createGithubPrViaApi(
    remote: { host: string; owner: string; repo: string },
    token: string,
    input: { title: string; baseBranch: string; headBranch: string; body: string },
  ): Promise<{ status: "created" | "opened_existing"; url: string; number: number; baseBranch: string; headBranch: string; title: string }> {
    const apiBase =
      remote.host === "github.com"
        ? "https://api.github.com"
        : `https://${remote.host}/api/v3`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "jait-gateway",
    };

    // If an open PR already exists for this head branch, reuse it
    const headParam = `${remote.owner}:${input.headBranch}`;
    try {
      const existingRes = await fetch(
        `${apiBase}/repos/${remote.owner}/${remote.repo}/pulls?head=${encodeURIComponent(headParam)}&state=open`,
        { headers },
      );
      if (existingRes.ok) {
        const existing = await existingRes.json() as Array<Record<string, unknown>>;
        const first = existing[0];
        if (first?.html_url) {
          return {
            status: "opened_existing",
            url: String(first.html_url),
            number: Number(first.number ?? 0),
            baseBranch: String((first.base as Record<string, unknown>)?.ref ?? input.baseBranch),
            headBranch: String((first.head as Record<string, unknown>)?.ref ?? input.headBranch),
            title: String(first.title ?? input.title),
          };
        }
      }
    } catch { /* ignore fetch errors and proceed to create */ }

    const res = await fetch(
      `${apiBase}/repos/${remote.owner}/${remote.repo}/pulls`,
      {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: input.title,
          head: headParam,
          base: input.baseBranch,
          body: input.body,
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`GitHub API PR create failed (${res.status}): ${text.slice(0, 400)}`);
    }

    const json = await res.json() as Record<string, unknown>;
    return {
      status: "created",
      url: String(json.html_url ?? ""),
      number: Number(json.number ?? 0),
      baseBranch: String((json.base as { ref?: string } | undefined)?.ref ?? input.baseBranch),
      headBranch: String((json.head as { ref?: string } | undefined)?.ref ?? input.headBranch),
      title: String(json.title ?? input.title),
    };
  }

  private async fetchGithubPrByHead(
    remote: { host: string; owner: string; repo: string },
    token: string,
    headBranch: string,
  ): Promise<GitStatusPr | null> {
    const apiBase =
      remote.host === "github.com"
        ? "https://api.github.com"
        : `https://${remote.host}/api/v3`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "jait-gateway",
    };
    const headParam = `${remote.owner}:${headBranch}`;

    try {
      const res = await fetch(
        `${apiBase}/repos/${remote.owner}/${remote.repo}/pulls?head=${encodeURIComponent(headParam)}&state=all`,
        { headers },
      );
      if (!res.ok) return null;
      const list = await res.json() as Array<Record<string, unknown>>;
      if (!Array.isArray(list) || list.length === 0) return null;
      // Prefer open PR, otherwise take the most recent
      const prData = (list.find((p) => p?.state === "open") ?? list[0]) as {
        number?: number;
        title?: string;
        html_url?: string;
        state?: string;
        merged_at?: string | null;
        base?: { ref?: string };
        head?: { ref?: string };
      };
      if (!prData?.html_url) return null;
      const stateRaw = String(prData.state ?? "open").toLowerCase();
      const mergedAt = prData.merged_at;
      const state: GitStatusPr["state"] =
        mergedAt ? "merged"
          : stateRaw === "closed" ? "closed"
            : "open";

      return {
        number: Number(prData.number ?? 0),
        title: String(prData.title ?? ""),
        url: String(prData.html_url ?? ""),
        baseBranch: String((prData.base as { ref?: string } | undefined)?.ref ?? ""),
        headBranch: String((prData.head as { ref?: string } | undefined)?.ref ?? headBranch),
        state,
      };
    } catch {
      return null;
    }
  }

  /**
   * Generate a pull request body from the diff between base and head.
   * Collects commit log + diff stat and formats as markdown.
   */
  async generatePrBody(cwd: string, baseBranch: string, headBranch: string, prTitle: string): Promise<string> {
    const MAX_COMMITS = 12_000;
    const MAX_STAT = 12_000;

    let commits = "";
    try {
      const raw = await gitExec(cwd, `log --oneline ${baseBranch}..${headBranch}`, 15_000);
      commits = raw.length > MAX_COMMITS ? raw.slice(0, MAX_COMMITS) + "\n... (truncated)" : raw;
    } catch { /* no common ancestor or baseBranch doesn't exist locally */ }

    let diffStat = "";
    try {
      const raw = await gitExec(cwd, `diff --stat ${baseBranch}..${headBranch}`, 15_000);
      diffStat = raw.length > MAX_STAT ? raw.slice(0, MAX_STAT) + "\n... (truncated)" : raw;
    } catch { /* ignore */ }

    // Build markdown body
    const sections: string[] = [];

    sections.push(`## Summary\n`);
    sections.push(`${prTitle}\n`);

    if (commits) {
      sections.push(`## Commits\n`);
      sections.push("```");
      sections.push(commits);
      sections.push("```\n");
    }

    if (diffStat) {
      sections.push(`## Changes\n`);
      sections.push("```");
      sections.push(diffStat);
      sections.push("```\n");
    }

    sections.push(`---\n*PR created by [Jait](https://github.com/Widev-e-U/Jait) automation.*`);

    return sections.join("\n");
  }

  /**
   * Build a URL to create a new pull request on the hosting provider.
   * Supports GitHub, GitLab, Bitbucket, and Azure DevOps remote URLs.
   */
  async buildCreatePrUrl(cwd: string, branch: string, remoteName?: string, baseBranch?: string): Promise<string | undefined> {
    const preferredRemote = remoteName ?? await this.getPreferredRemote(cwd, branch);
    if (!preferredRemote) return undefined;
    const raw = await this.getRemoteUrl(cwd, preferredRemote);
    if (!raw) return undefined;
    const parsed = parseGitRemote(raw);
    if (!parsed) return undefined;

    if (parsed.provider === "github") {
      return `${parsed.normalizedUrl}/compare/${encodeURIComponent(baseBranch ?? "main")}...${encodeURIComponent(branch)}?expand=1`;
    }
    if (parsed.provider === "gitlab") {
      return `${parsed.normalizedUrl}/-/merge_requests/new?merge_request[source_branch]=${encodeURIComponent(branch)}`;
    }
    if (parsed.provider === "bitbucket") {
      return `${parsed.normalizedUrl}/pull-requests/new?source=${encodeURIComponent(branch)}`;
    }
    if (parsed.provider === "azure-devops") {
      return `${parsed.normalizedUrl}/pullrequestcreate?sourceRef=${encodeURIComponent(`refs/heads/${branch}`)}${baseBranch ? `&targetRef=${encodeURIComponent(`refs/heads/${baseBranch}`)}` : ""}`;
    }
    if (parsed.provider === "gitea") {
      return `${parsed.normalizedUrl}/compare/${encodeURIComponent(baseBranch ?? "main")}...${encodeURIComponent(branch)}`;
    }

    return undefined;
  }

  /** Return the diff of uncommitted changes (staged + unstaged). */
  async diff(cwd: string): Promise<GitDiffResult> {
    const isGit = await this.isRepo(cwd);
    if (!isGit) return { diff: "", files: [], hasChanges: false };

    // One diff pass against HEAD covers staged + unstaged changes. An unborn
    // HEAD fails, so fall back to the two separate diffs (rare: fresh repo).
    let diffText = "";
    try {
      diffText = await gitExec(cwd, "diff HEAD");
    } catch {
      const staged = await gitExec(cwd, "diff --cached").catch(() => "");
      const unstaged = await gitExec(cwd, "diff").catch(() => "");
      diffText = [staged, unstaged].filter(Boolean).join("\n");
    }

    // Reuse the memoized status pass for the changed-file list + untracked
    // files instead of spawning a dedicated `git status --porcelain`.
    const status = await this.status(cwd);
    const fileSet = new Set<string>();
    for (const file of status.index.files) fileSet.add(file.path);
    for (const file of status.workingTree.files) fileSet.add(file.path);
    const untrackedFiles = status.workingTree.files
      .filter((f) => f.status === "?")
      .map((f) => f.path);

    if (untrackedFiles.length > 0) {
      const untrackedSection = untrackedFiles.map((f) => `+++ new file: ${f}`).join("\n");
      diffText = diffText ? `${diffText}\n\n# Untracked files:\n${untrackedSection}` : `# Untracked files:\n${untrackedSection}`;
    }

    const files = [...fileSet];

    return {
      diff: diffText,
      files,
      hasChanges: files.length > 0,
    };
  }

  async diffStats(cwd: string, baseBranch?: string, branch?: string): Promise<GitDiffStatsResult> {
    const isGit = await this.isRepo(cwd);
    if (!isGit) {
      return { files: 0, insertions: 0, deletions: 0, hasChanges: false };
    }

    const filePaths = new Set<string>();
    let insertions = 0;
    let deletions = 0;

    const collectNumstatText = (numstat: string): void => {
      for (const line of numstat.split("\n").filter(Boolean)) {
        const [ins, del, filePath] = line.split("\t");
        if (!filePath) continue;
        filePaths.add(filePath);
        insertions += ins === "-" ? 0 : parseInt(ins ?? "0", 10);
        deletions += del === "-" ? 0 : parseInt(del ?? "0", 10);
      }
    };
    const collectNumstat = async (args: string): Promise<void> => {
      collectNumstatText(await gitExec(cwd, args).catch(() => ""));
    };

    if (baseBranch && branch) {
      const diffBase = await this.resolveBranchDiffBase(cwd, baseBranch, branch);
      await collectNumstat(`diff --numstat ${JSON.stringify(diffBase)} ${JSON.stringify(branch)}`);
    } else if (baseBranch) {
      const diffBase = await this.resolveWorkingTreeDiffBase(cwd, baseBranch);
      await collectNumstat(`diff --numstat ${JSON.stringify(diffBase)}`);
    } else {
      // A single `diff HEAD` pass covers staged + unstaged changes in one spawn.
      // An unborn HEAD (repo with no commits yet) makes it fail, so fall back.
      const combined = await gitExec(cwd, "diff --numstat HEAD").catch(() => null);
      if (combined === null) {
        await collectNumstat("diff --cached --numstat");
        await collectNumstat("diff --numstat");
      } else {
        collectNumstatText(combined);
      }
    }

    if (!branch) {
      // Untracked files never appear in a diff, and the memoized status pass
      // already enumerates them (with -uall) — reuse it instead of spawning
      // another `git status`.
      const status = await this.status(cwd);
      for (const file of status.workingTree.files) {
        if (file.status === "?") filePaths.add(file.path);
      }
    }

    return {
      files: filePaths.size,
      insertions,
      deletions,
      hasChanges: filePaths.size > 0,
    };
  }

  /**
   * Return per-file original and modified content so the frontend can
   * render a Monaco diff editor.
   *
   * @param baseBranch — when given, diff working tree against that branch
   *   (shows all thread changes: committed + uncommitted).
   * @param branch — when given with baseBranch, diff the thread branch
   *   against its merge-base with baseBranch (matches PR-style history).
   *   When omitted entirely, only uncommitted working-tree changes are
   *   returned (original = HEAD).
   */
  async fileDiffs(
    cwd: string,
    baseBranch?: string,
    branch?: string,
    paths?: string[],
  ): Promise<FileDiffEntry[]> {
    const filter = normalizeDiffPathFilter(paths);
    const isGit = await this.isRepo(cwd);
    if (!isGit) return [];

    if (baseBranch && branch) {
      return this.fileDiffsBetweenRefs(cwd, baseBranch, branch, filter);
    }

    if (baseBranch) {
      return this.fileDiffsBranch(cwd, baseBranch, filter);
    }

    const porcelain = await gitExec(cwd, "status --porcelain -z --untracked-files=all");
    const records = porcelain.split("\0");
    // Collect the changed paths first, then read every file's contents in
    // parallel: the per-file `git show`/read used to run strictly serially.
    const candidates: Array<{ path: string; originalPath: string; status: string }> = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i]!;
      if (!record) continue;
      const xy = record.slice(0, 2);
      const filePath = record.slice(3);
      const originalPath = xy.includes("R") || xy.includes("C") ? records[++i]! : filePath;

      // Determine status code
      let status = "M";
      if (xy.includes("?")) status = "?";
      else if (xy.includes("A")) status = "A";
      else if (xy.includes("D")) status = "D";
      else if (xy.includes("R")) status = "R";

      candidates.push({ path: filePath, originalPath, status });
    }

    const selected = candidates.filter((candidate) => matchesDiffPathFilter(candidate.path, filter));
    // One `git cat-file --batch` call covers every HEAD blob in the changeset.
    const headSpecs = new Map<string, string>();
    for (const candidate of selected) {
      if (candidate.status !== "A" && candidate.status !== "?") {
        headSpecs.set(candidate.path, `HEAD:${gitRevisionPath(candidate.originalPath)}`);
      }
    }
    const headBlobs = await readBlobsBatchSafe(cwd, [...headSpecs.values()]);

    return mapWithConcurrency(
      selected,
      DIFF_READ_CONCURRENCY,
      async (candidate): Promise<FileDiffEntry> => {
        const spec = headSpecs.get(candidate.path);
        const original = spec === undefined ? "" : headBlobs.get(spec) ?? "";

        // Get current working tree content
        let modified = "";
        if (candidate.status !== "D") {
          try {
            modified = await readDiffFileCapped(join(cwd, candidate.path));
          } catch {
            modified = "";
          }
        }

        return { path: candidate.path, original, modified, status: candidate.status };
      },
    );
  }

  /**
   * Diff working tree against a base branch (shows all committed + uncommitted changes).
   */
  private async fileDiffsBranch(
    cwd: string,
    baseBranch: string,
    filter: Set<string> | null = null,
  ): Promise<FileDiffEntry[]> {
    // Diff the working tree against the point it diverged from baseBranch, so
    // commits the base gained after this branch was created aren't reported.
    const diffBase = await this.resolveWorkingTreeDiffBase(cwd, baseBranch);
    const nameStatus = await gitExec(cwd, `diff --name-status ${JSON.stringify(diffBase)}`).catch(() => "");
    const lines = nameStatus.split("\n").filter(Boolean);
    const candidates: Array<{ path: string; status: string }> = [];
    const seen = new Set<string>();

    for (const line of lines) {
      const parts = line.split("\t");
      const statusCode = parts[0]?.trim() ?? "M";
      let filePath = parts[parts.length - 1]?.trim() ?? "";

      let status = "M";
      if (statusCode.startsWith("A")) status = "A";
      else if (statusCode.startsWith("D")) status = "D";
      else if (statusCode.startsWith("R")) {
        status = "R";
        filePath = parts[2]?.trim() ?? filePath;
      }

      if (!filePath || seen.has(filePath)) continue;
      seen.add(filePath);
      if (!matchesDiffPathFilter(filePath, filter)) continue;
      candidates.push({ path: filePath, status });
    }

    // Also include untracked files that aren't already listed
    const porcelain = await gitExec(cwd, "status --porcelain").catch(() => "");
    for (const pl of porcelain.split("\n").filter(Boolean)) {
      if (!pl.startsWith("??")) continue;
      const fp = pl.slice(3).trim();
      if (!fp || seen.has(fp)) continue;
      seen.add(fp);
      if (!matchesDiffPathFilter(fp, filter)) continue;
      candidates.push({ path: fp, status: "?" });
    }

    const baseBlobs = await readBlobsBatchSafe(
      cwd,
      candidates
        .filter((candidate) => candidate.status !== "A" && candidate.status !== "?")
        .map((candidate) => `${diffBase}:${gitRevisionPath(candidate.path)}`),
    );

    return mapWithConcurrency(candidates, DIFF_READ_CONCURRENCY, async (candidate) => {
      const spec = candidate.status === "A" || candidate.status === "?"
        ? undefined
        : `${diffBase}:${gitRevisionPath(candidate.path)}`;
      const original = spec === undefined ? "" : baseBlobs.get(spec) ?? "";

      let modified = "";
      if (candidate.status !== "D") {
        try {
          modified = await readDiffFileCapped(join(cwd, candidate.path));
        } catch { modified = ""; }
      }

      return { path: candidate.path, original, modified, status: candidate.status };
    });
  }

  /**
   * Diff a branch against its merge-base with the base branch, matching the
   * PR view even after the base branch has moved on.
   */
  private async fileDiffsBetweenRefs(
    cwd: string,
    baseBranch: string,
    branch: string,
    filter: Set<string> | null = null,
  ): Promise<FileDiffEntry[]> {
    const diffBase = await this.resolveBranchDiffBase(cwd, baseBranch, branch);
    const nameStatus = await gitExec(cwd, `diff --name-status ${JSON.stringify(diffBase)} ${JSON.stringify(branch)}`).catch(() => "");
    const lines = nameStatus.split("\n").filter(Boolean);
    const candidates: Array<{ path: string; status: string }> = [];
    const seen = new Set<string>();

    for (const line of lines) {
      const parts = line.split("\t");
      const statusCode = parts[0]?.trim() ?? "M";
      let filePath = parts[parts.length - 1]?.trim() ?? "";

      let status = "M";
      if (statusCode.startsWith("A")) status = "A";
      else if (statusCode.startsWith("D")) status = "D";
      else if (statusCode.startsWith("R")) {
        status = "R";
        filePath = parts[2]?.trim() ?? filePath;
      }

      if (!filePath || seen.has(filePath)) continue;
      seen.add(filePath);
      if (!matchesDiffPathFilter(filePath, filter)) continue;
      candidates.push({ path: filePath, status });
    }

    const baseSpecs = new Map<string, string>();
    const branchSpecs = new Map<string, string>();
    for (const candidate of candidates) {
      if (candidate.status !== "A") {
        baseSpecs.set(candidate.path, `${diffBase}:${gitRevisionPath(candidate.path)}`);
      }
      if (candidate.status !== "D") {
        branchSpecs.set(candidate.path, `${branch}:${gitRevisionPath(candidate.path)}`);
      }
    }
    const [baseBlobs, branchBlobs] = await Promise.all([
      readBlobsBatchSafe(cwd, [...baseSpecs.values()]),
      readBlobsBatchSafe(cwd, [...branchSpecs.values()]),
    ]);

    return mapWithConcurrency(candidates, DIFF_READ_CONCURRENCY, async (candidate) => {
      const baseSpec = baseSpecs.get(candidate.path);
      const branchSpec = branchSpecs.get(candidate.path);
      const original = baseSpec === undefined ? "" : baseBlobs.get(baseSpec) ?? "";
      const modified = branchSpec === undefined ? "" : branchBlobs.get(branchSpec) ?? "";

      return { path: candidate.path, original, modified, status: candidate.status };
    });
  }

  /**
   * Resolve a base branch to the commit where the working tree's HEAD
   * diverged from it. Diffing the working tree against this merge-base
   * (instead of the base branch tip) shows only the changes made on this
   * side, even when the base branch has advanced past where this branch was
   * created. Without this, a branch that is behind the base branch reports
   * the base's newer commits — inverted — as if this thread authored them.
   */
  private async resolveWorkingTreeDiffBase(cwd: string, baseBranch: string): Promise<string> {
    const mergeBase = await gitExec(
      cwd,
      `merge-base ${JSON.stringify(baseBranch)} HEAD`,
    ).catch(() => "");
    return mergeBase.trim() || baseBranch;
  }

  private async resolveBranchDiffBase(cwd: string, baseBranch: string, branch: string): Promise<string> {
    const [mergeBase, branchSha] = await Promise.all([
      gitExec(
        cwd,
        `merge-base ${JSON.stringify(baseBranch)} ${JSON.stringify(branch)}`,
      ).catch(() => ""),
      gitExec(cwd, `rev-parse ${JSON.stringify(branch)}`).catch(() => ""),
    ]);
    const normalizedMergeBase = mergeBase.trim();
    const normalizedBranchSha = branchSha.trim();
    if (!normalizedMergeBase) return baseBranch;
    if (!normalizedBranchSha || normalizedMergeBase !== normalizedBranchSha) {
      return normalizedMergeBase;
    }

    const mergeCommits = await gitExec(
      cwd,
      `rev-list --first-parent --merges ${JSON.stringify(baseBranch)}`,
    ).catch(() => "");
    for (const mergeCommit of mergeCommits.split("\n").filter(Boolean)) {
      const parentLine = await gitExec(
        cwd,
        `rev-list --parents -n 1 ${JSON.stringify(mergeCommit)}`,
      ).catch(() => "");
      const parts = parentLine.trim().split(/\s+/).filter(Boolean);
      if (parts.length < 3) continue;
      const firstParent = parts[1];
      if (!firstParent) continue;
      for (const parent of parts.slice(2)) {
        const mergedFromBranch = await gitExec(
          cwd,
          `merge-base --is-ancestor ${JSON.stringify(normalizedBranchSha)} ${JSON.stringify(parent)}`,
        ).then(() => true).catch(() => false);
        if (mergedFromBranch) return firstParent;
      }
    }

    return normalizedMergeBase;
  }

  /**
   * Heuristic for whether a repo is large enough to warrant the fast CoW
   * worktree path. Primary signal is the tracked-file count (`git ls-files`),
   * which is cheap even on huge repos; falls back to working-tree size in
   * bytes when the file-count probe fails. Never throws — on any error it
   * returns false so callers fall back to the plain checkout.
   */
  private async isLargeRepo(cwd: string): Promise<boolean> {
    try {
      const fileCount = await gitExec(cwd, "ls-files | wc -l").catch(() => "");
      const count = parseInt(fileCount.trim(), 10);
      if (Number.isFinite(count)) return count > LARGE_REPO_FILE_THRESHOLD;
    } catch {
      // fall through to the size probe
    }

    try {
      const sizeKb = await exec(`du -sk ${JSON.stringify(cwd)}`, { maxBuffer: 16 * 1024 * 1024 });
      const bytes = parseInt(sizeKb.stdout.trim(), 10) * 1024;
      if (Number.isFinite(bytes)) return bytes > LARGE_REPO_BYTES_THRESHOLD;
    } catch {
      // ignore
    }

    return false;
  }
}

/**
 * Clean up a worktree, proxying to a remote FsNode when the path
 * doesn't exist locally (e.g. a Windows worktree on a Linux gateway).
 */
export async function cleanupWorktreeRemoteAware(
  worktreePath: string,
  ws?: { proxyFsOp<T = unknown>(nodeId: string, op: string, params: Record<string, unknown>, timeout: number): Promise<T>; getFsNodes(): { id: string; isGateway?: boolean; platform?: string }[] },
  branch?: string | null,
  options?: { preserveBranch?: boolean },
): Promise<void> {
  if (!worktreePath) return;

  // If path exists locally, use local cleanup
  if (existsSync(worktreePath)) {
    const svc = new GitService();
    await svc.cleanupWorktreeWithOptions(worktreePath, {
      branch,
      preserveBranch: options?.preserveBranch === true,
    });
    return;
  }

  // Path doesn't exist locally — try to find a remote node
  if (!ws) return;
  const isWindowsPath = /^[A-Za-z]:[\\\/]/.test(worktreePath);
  const expectedPlatform = isWindowsPath ? "windows" : null;
  let remoteNodeId: string | null = null;
  for (const node of ws.getFsNodes()) {
    if (node.isGateway) continue;
    if (expectedPlatform && node.platform !== expectedPlatform) continue;
    remoteNodeId = node.id;
    break;
  }
  if (!remoteNodeId) return;

  await ws.proxyFsOp(remoteNodeId, "git-remove-worktree", { path: worktreePath }, 30_000);
}
