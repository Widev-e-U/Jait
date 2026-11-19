/**
 * Git workspaces for plan runs. Writing tasks never touch the user's checkout:
 * each one works in its own worktree on a task branch that starts from the
 * run's integration branch. Finished, verified work is committed in-scope and
 * merged into the integration branch, which the owner reviews. Nothing is
 * pushed and nothing is merged into the user's branch.
 *
 * Worktree creation reuses GitService.createWorktree and git runs through
 * gitExecArgs, so the existing per-repository git lock applies. Merges are
 * serialized per run by the orchestrator. A merge left in progress by a crash
 * is aborted before the next operation on that worktree.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { getStateDirectory } from "../../state-directory.js";
import { GitService, gitExecArgs } from "../git.js";
import type { RepositoryService } from "../repositories.js";
import { isNamedResourceKey, pathIsProtected, PROJECT_ROOT_KEY } from "./resources.js";

/** Deterministic failure before any agent work or integration (bad repo, dirty scope, ...). */
export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceError";
  }
}

/** A merge that conflicted. The merge was aborted, so the integration branch is unchanged. */
export class WorkspaceConflictError extends Error {
  constructor(
    message: string,
    readonly files: readonly string[],
  ) {
    super(message);
    this.name = "WorkspaceConflictError";
  }
}

/** The integration branch advanced after the task was last synced, so its verification does not cover the combined state. Nothing was merged. */
export class WorkspaceStaleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceStaleError";
  }
}

const MAX_PATHS = 5_000;
const IDENTITY_FALLBACK = ["-c", "user.name=Jait Workflow", "-c", "user.email=workflow@jait.invalid"];

export function integrationBranchName(runId: string): string {
  return `jait/wf/${runId}/integration`;
}

/** Task ids may contain characters that are invalid in git refs, so the branch uses a slug plus a hash of the exact id. */
export function taskBranchName(runId: string, taskId: string): string {
  return `jait/wf/${runId}/${taskSlug(taskId)}`;
}

function taskSlug(taskId: string): string {
  const safe = taskId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40);
  const hash = createHash("sha256").update(taskId).digest("hex").slice(0, 8);
  return `t-${safe}-${hash}`;
}

/** True when a changed path falls under one of the declared write claims. Named resources cover no path. */
export function pathCoveredByWrites(path: string, writes: readonly string[]): boolean {
  return writes.some((write) => {
    if (isNamedResourceKey(write)) return false;
    return write === PROJECT_ROOT_KEY || path === write || path.startsWith(`${write}/`);
  });
}

function splitNul(output: string): string[] {
  return output.split("\0").filter((entry) => entry.length > 0);
}

/** The scope violations in the words errors use, or an empty string when the scope holds. */
function describeScopeViolations(scope: ScopeResult): string {
  const parts: string[] = [];
  if (scope.outside.length > 0) parts.push(`outside the declared writes (${scope.outside.slice(0, 10).join(", ")})`);
  const protectedPaths = scope.protectedPaths ?? [];
  if (protectedPaths.length > 0) parts.push(`in protected paths (${protectedPaths.slice(0, 10).join(", ")})`);
  return parts.join(" and ");
}

async function git(cwd: string, args: string[], timeout = 120_000): Promise<string> {
  return gitExecArgs(cwd, args, timeout);
}

/** Uses the repository's identity when one is configured, otherwise a workflow identity for merge and commit objects. */
async function gitWithIdentity(cwd: string, args: string[]): Promise<string> {
  const configured = await git(cwd, ["config", "--get", "user.email"], 30_000).then(
    (value) => value.trim().length > 0,
    () => false,
  );
  return git(cwd, [...(configured ? [] : IDENTITY_FALLBACK), ...args]);
}

async function headCommit(cwd: string): Promise<string> {
  return (await git(cwd, ["rev-parse", "--verify", "HEAD^{commit}"], 30_000)).trim();
}

async function branchExists(repo: string, branch: string): Promise<boolean> {
  return git(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], 30_000).then(
    () => true,
    () => false,
  );
}

async function mergeInProgress(cwd: string): Promise<boolean> {
  return git(cwd, ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], 30_000).then(
    () => true,
    () => false,
  );
}

/** Aborts a merge left behind by an interrupted process. Only used on managed workflow worktrees. */
async function clearLeftoverMerge(cwd: string): Promise<void> {
  if (await mergeInProgress(cwd)) {
    await git(cwd, ["merge", "--abort"], 60_000);
  }
}

export interface WorkspaceLocation {
  path: string;
  branch: string;
}

/** Identifies one task attempt's workspace. The owner and repository decide which checkout may be used. */
export interface WorkspaceRef {
  userId: string;
  repoId: string | null;
  runId: string;
  taskId: string;
}

/**
 * Workspace operations the orchestrator depends on. The git-backed implementation
 * is WorkflowWorkspaces. Tests can substitute a double without git.
 */
export interface WorkspaceProvider {
  /** Throws WorkspaceError when runs for this owner and repository cannot host isolated workspaces. */
  assertRunHost(userId: string, repoId: string | null): void;
  prepareRead(ref: WorkspaceRef): Promise<WorkspaceLocation>;
  /** `protects` are paths inside `writes` the task must leave untouched. */
  prepareWrite(ref: WorkspaceRef, writes: readonly string[], protects?: readonly string[]): Promise<WorkspaceLocation>;
  checkScope(ref: WorkspaceRef, path: string, writes: readonly string[], protects?: readonly string[]): Promise<ScopeResult>;
  integrate(
    ref: WorkspaceRef,
    writes: readonly string[],
    message: string,
    protects?: readonly string[],
  ): Promise<IntegrationResult>;
}

export interface ScopeResult {
  /** False when a changed path is outside the declared writes or touches a protected path. */
  ok: boolean;
  outside: string[];
  changed: string[];
  /** Changed paths inside the declared writes that match a protected entry. */
  protectedPaths?: string[];
  /** Tracked files the task deleted, so a deletion is always visible in the evidence. */
  deleted?: string[];
}

export interface IntegrationResult {
  /** True when the integration branch moved (a merge commit or fast-forward happened). */
  integrated: boolean;
  /** Integration head after the step. */
  head: string;
}

export interface WorkspaceOptions {
  /** Managed root for workflow worktrees. Defaults to <state>/worktrees/workflows. */
  root?: string;
  /** Owned repositories. Without this, no run can host workspaces (fail closed). */
  repositories?: Pick<RepositoryService, "getById">;
}

export class WorkflowWorkspaces implements WorkspaceProvider {
  private readonly root: string;
  private readonly repositories: Pick<RepositoryService, "getById"> | undefined;

  constructor(options: WorkspaceOptions = {}) {
    this.root = options.root ?? join(getStateDirectory(), "worktrees", "workflows");
    this.repositories = options.repositories;
  }

  assertRunHost(userId: string, repoId: string | null): void {
    this.repoPath(userId, repoId);
  }

  /** Gateway-local repository the owner owns. Anything else cannot host worktrees. */
  private repoPath(userId: string, repoId: string | null): string {
    const repository = repoId && this.repositories ? this.repositories.getById(repoId) : undefined;
    if (!repository || repository.userId !== userId || repository.deviceId || !isAbsolute(repository.localPath)) {
      throw new WorkspaceError("workspace tasks need an owned gateway-local repository");
    }
    return repository.localPath;
  }

  integrationPath(runId: string): string {
    return join(this.root, runId, "integration");
  }

  taskPath(runId: string, taskId: string): string {
    return join(this.root, runId, taskSlug(taskId));
  }

  /** Read-only view of the integrated state, used by tasks that declare reads but no writes. */
  async prepareRead(ref: WorkspaceRef): Promise<WorkspaceLocation> {
    return this.ensureIntegration(this.repoPath(ref.userId, ref.repoId), ref.runId);
  }

  /**
   * Isolated worktree for a writing task. It starts from the integration head, so a
   * dependent sees its predecessors' integrated changes. An existing worktree keeps
   * its earlier in-scope work, which is checkpointed before the sync merge.
   */
  async prepareWrite(
    ref: WorkspaceRef,
    writes: readonly string[],
    protects: readonly string[] = [],
  ): Promise<WorkspaceLocation> {
    const repoPath = this.repoPath(ref.userId, ref.repoId);
    const { runId, taskId } = ref;
    const integration = await this.ensureIntegration(repoPath, runId);
    const path = this.taskPath(runId, taskId);
    const branch = taskBranchName(runId, taskId);
    const head = await headCommit(integration.path);
    await ensureWorktree(repoPath, path, branch, head);
    await clearLeftoverMerge(path);

    // Leftovers are committed below, so protected or out-of-scope changes must stop here, uncommitted, for an operator to inspect.
    const scope = await this.checkScope(ref, path, writes, protects);
    if (!scope.ok) {
      throw new WorkspaceError(`workspace has changes ${describeScopeViolations(scope)}; inspect ${path}`);
    }
    const uncommitted = await this.changedPaths(path, "HEAD");
    if (uncommitted.changed.length > 0) {
      await this.commitInScope(path, uncommitted.changed, `wip: earlier attempt of ${taskId}`);
    }
    await this.mergeInto(path, integration.branch, `sync ${taskId} with integration`);
    return { path, branch };
  }

  /**
   * Include committed task-branch changes, staged changes and the worktree. A
   * worker may commit on its branch, so HEAD alone is not an authority boundary.
   */
  async checkScope(ref: WorkspaceRef, path: string, writes: readonly string[], protects: readonly string[] = []): Promise<ScopeResult> {
    this.repoPath(ref.userId, ref.repoId);
    if (path !== this.taskPath(ref.runId, ref.taskId)) throw new WorkspaceError("scope check requires the task workspace");
    const branch = (await git(path, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    if (branch !== taskBranchName(ref.runId, ref.taskId)) throw new WorkspaceError("scope check requires the assigned task branch");
    const base = (await git(path, ["merge-base", "HEAD", integrationBranchName(ref.runId)])).trim();
    if (!/^[0-9a-f]{40,64}$/.test(base)) throw new WorkspaceError("cannot determine task integration base");
    const { changed, deleted } = await this.changedPaths(path, base);
    const outside = changed.filter((file) => !pathCoveredByWrites(file, writes));
    const protectedPaths = changed.filter((file) => pathCoveredByWrites(file, writes) && pathIsProtected(file, protects));
    return { ok: outside.length === 0 && protectedPaths.length === 0, outside, changed, protectedPaths, deleted };
  }

  /**
   * Commits the task's in-scope changes on its branch and merges the branch into
   * the integration branch. A conflict aborts the merge and throws, leaving the
   * integration branch as it was.
   */
  async integrate(
    ref: WorkspaceRef,
    writes: readonly string[],
    message: string,
    protects: readonly string[] = [],
  ): Promise<IntegrationResult> {
    const repoPath = this.repoPath(ref.userId, ref.repoId);
    const integration = await this.ensureIntegration(repoPath, ref.runId);
    const task = await this.existingTask(repoPath, ref.runId, ref.taskId);
    const scope = await this.checkScope(ref, task.path, writes, protects);
    if (!scope.ok) {
      throw new WorkspaceError(`changes ${describeScopeViolations(scope)} block integration`);
    }
    const uncommitted = await this.changedPaths(task.path, "HEAD");
    if (uncommitted.changed.length > 0) await this.commitInScope(task.path, uncommitted.changed, message);
    const before = await headCommit(integration.path);
    // A concurrent writer may have landed after this task was verified; merging now would skip verifying the combined state.
    if (!(await isAncestor(task.path, before, task.branch))) {
      throw new WorkspaceStaleError("integration advanced since this task was verified");
    }
    const merged = await this.mergeInto(integration.path, task.branch, message);
    return { integrated: merged.head !== before, head: merged.head };
  }

  private async existingTask(repoPath: string, runId: string, taskId: string): Promise<WorkspaceLocation> {
    const path = this.taskPath(runId, taskId);
    const branch = taskBranchName(runId, taskId);
    if (!existsSync(path) || !(await branchExists(repoPath, branch))) {
      throw new WorkspaceError(`no workspace exists for task ${taskId}`);
    }
    return { path, branch };
  }

  private async ensureIntegration(repoPath: string, runId: string): Promise<WorkspaceLocation> {
    const path = this.integrationPath(runId);
    const branch = integrationBranchName(runId);
    const base = existsSync(path) || (await branchExists(repoPath, branch)) ? null : await headCommit(repoPath);
    await ensureWorktree(repoPath, path, branch, base);
    await clearLeftoverMerge(path);
    return { path, branch };
  }

  /** Include the final tree and index separately, so staged changes cannot hide behind worktree reversions. */
  private async changedPaths(path: string, base: string): Promise<{ changed: string[]; deleted: string[] }> {
    const statuses = await Promise.all([
      git(path, ["--literal-pathspecs", "diff", "--no-renames", "--name-status", "-z", base]),
      git(path, ["--literal-pathspecs", "diff", "--cached", "--no-renames", "--name-status", "-z", "HEAD"]),
    ]);
    const tracked: string[] = [];
    const deleted: string[] = [];
    for (const output of statuses) {
      const status = splitNul(output);
      for (let index = 0; index + 1 < status.length; index += 2) {
        const file = status[index + 1] as string;
        tracked.push(file);
        if (status[index] === "D") deleted.push(file);
      }
    }
    const untracked = splitNul(await git(path, ["ls-files", "--others", "--exclude-standard", "-z"]));
    const changed = [...new Set([...tracked, ...untracked])].sort();
    if (changed.length > MAX_PATHS) throw new WorkspaceError(`too many changed paths (${changed.length}); limit is ${MAX_PATHS}`);
    return { changed, deleted: [...new Set(deleted)].sort() };
  }

  /** Stages exactly the given paths and commits them. Returns the new commit, or null when nothing was staged. */
  private async commitInScope(path: string, files: readonly string[], message: string): Promise<string | null> {
    await git(path, ["--literal-pathspecs", "add", "-A", "--", ...files]);
    const staged = splitNul(await git(path, ["diff", "--cached", "--name-only", "-z"]));
    if (staged.length === 0) return null;
    await gitWithIdentity(path, ["commit", "-m", message]);
    return headCommit(path);
  }

  private async mergeInto(cwd: string, branch: string, message: string): Promise<{ head: string }> {
    try {
      await gitWithIdentity(cwd, ["merge", "--no-ff", "--no-edit", "-m", message, branch]);
    } catch (error) {
      const files = splitNul(await git(cwd, ["diff", "--name-only", "--diff-filter=U", "-z"]).catch(() => ""));
      await git(cwd, ["merge", "--abort"]).catch(() => undefined);
      if (files.length === 0) {
        throw new WorkspaceError(`merge of ${branch} failed: ${error instanceof Error ? error.message.slice(0, 500) : "unknown error"}`);
      }
      throw new WorkspaceConflictError(`merge of ${branch} conflicts`, files);
    }
    return { head: await headCommit(cwd) };
  }
}

async function isAncestor(cwd: string, ancestor: string, descendant: string): Promise<boolean> {
  try {
    await git(cwd, ["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a worktree on `branch` at `path`, or reuses it. A new branch starts at
 * `base`. An existing branch (left behind by a crash) is checked out as is.
 */
async function ensureWorktree(repo: string, path: string, branch: string, base: string | null): Promise<void> {
  if (existsSync(path)) {
    const top = (await git(path, ["rev-parse", "--show-toplevel"], 30_000)).trim();
    const [realTop, realPath] = await Promise.all([realpath(top), realpath(path)]);
    const current = (await git(path, ["rev-parse", "--abbrev-ref", "HEAD"], 30_000)).trim();
    if (realTop !== realPath || current !== branch) {
      throw new WorkspaceError(`workspace path ${path} is not a worktree on ${branch}`);
    }
    return;
  }
  if (await branchExists(repo, branch)) {
    await git(repo, ["worktree", "add", path, branch], 60_000);
    return;
  }
  if (!base) throw new WorkspaceError(`cannot create ${branch} without a base commit`);
  await new GitService().createWorktree(repo, base, branch, path, { fastPath: false });
}
