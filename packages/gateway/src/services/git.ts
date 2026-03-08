/**
 * Server-side git operations service.
 *
 * Executes git and `gh` CLI commands in the requested working directory.
 * Adapted from the t3code GitService/GitManager pattern but running
 * directly through child_process on the gateway.
 */

import { exec as execCb } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { homedir } from "node:os";
import { promisify } from "node:util";

const exec = promisify(execCb);
const DEFAULT_TIMEOUT = 30_000;

// ── Types ──────────────────────────────────────────────────────────

export type GitStackedAction = "commit" | "commit_push" | "commit_push_pr";

export interface GitStatusFile {
  path: string;
  insertions: number;
  deletions: number;
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
  workingTree: {
    files: GitStatusFile[];
    insertions: number;
    deletions: number;
  };
  hasUpstream: boolean;
  aheadCount: number;
  behindCount: number;
  pr: GitStatusPr | null;
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
  push: { status: "pushed" | "skipped_not_requested" | "skipped_up_to_date" | "skipped_no_remote"; branch?: string; upstreamBranch?: string; setUpstream?: boolean; createPrUrl?: string };
  branch: { status: "created" | "skipped_not_requested"; name?: string };
  pr: { status: "created" | "opened_existing" | "skipped_not_requested" | "skipped_no_remote"; url?: string; number?: number; baseBranch?: string; headBranch?: string; title?: string };
}

export interface GitDiffResult {
  diff: string;
  files: string[];
  hasChanges: boolean;
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

export interface GitWorktreeResult {
  path: string;
  branch: string;
}

// ── Helpers ────────────────────────────────────────────────────────

async function gitExec(cwd: string, args: string, timeout = DEFAULT_TIMEOUT): Promise<string> {
  const { stdout } = await exec(`git ${args}`, { cwd, timeout });
  return stdout.trim();
}

async function ghExec(cwd: string, args: string, timeout = DEFAULT_TIMEOUT): Promise<string> {
  const { stdout } = await exec(`gh ${args}`, { cwd, timeout });
  return stdout.trim();
}

async function ghAvailable(cwd: string): Promise<boolean> {
  try {
    await exec("gh auth status", { cwd, timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

// ── Service ────────────────────────────────────────────────────────

export class GitService {
  async isRepo(cwd: string): Promise<boolean> {
    try {
      await gitExec(cwd, "rev-parse --is-inside-work-tree");
      return true;
    } catch {
      return false;
    }
  }

  async init(cwd: string): Promise<void> {
    await gitExec(cwd, "init");
  }

  async status(cwd: string, _branch?: string): Promise<GitStatusResult> {
    const isGit = await this.isRepo(cwd);
    if (!isGit) {
      return {
        branch: null,
        hasWorkingTreeChanges: false,
        workingTree: { files: [], insertions: 0, deletions: 0 },
        hasUpstream: false,
        aheadCount: 0,
        behindCount: 0,
        pr: null,
      };
    }

    // Branch
    let branch: string | null = null;
    try {
      branch = await gitExec(cwd, "rev-parse --abbrev-ref HEAD");
      if (branch === "HEAD") branch = null;
    } catch { /* detached HEAD */ }

    // Status summary
    const porcelain = await gitExec(cwd, "status --porcelain").catch(() => "");
    const hasChanges = porcelain.length > 0;

    // Diff stats for changed files
    const files: GitStatusFile[] = [];
    let totalInsertions = 0;
    let totalDeletions = 0;
    if (hasChanges) {
      try {
        const diffStat = await gitExec(cwd, "diff --numstat HEAD 2>/dev/null || git diff --numstat");
        for (const line of diffStat.split("\n").filter(Boolean)) {
          const [ins, del, filePath] = line.split("\t");
          const insertions = ins === "-" ? 0 : parseInt(ins ?? "0", 10);
          const deletions = del === "-" ? 0 : parseInt(del ?? "0", 10);
          if (filePath) {
            files.push({ path: filePath, insertions, deletions });
            totalInsertions += insertions;
            totalDeletions += deletions;
          }
        }
        // Also count untracked files
        const untracked = porcelain.split("\n").filter((l) => l.startsWith("??"));
        for (const line of untracked) {
          const filePath = line.slice(3).trim();
          if (filePath && !files.some((f) => f.path === filePath)) {
            files.push({ path: filePath, insertions: 0, deletions: 0 });
          }
        }
      } catch { /* ignore diff failures */ }
    }

    // Upstream tracking
    let hasUpstream = false;
    let aheadCount = 0;
    let behindCount = 0;
    if (branch) {
      try {
        const upstream = await gitExec(cwd, `rev-parse --abbrev-ref ${branch}@{upstream}`);
        hasUpstream = !!upstream;
        const counts = await gitExec(cwd, `rev-list --left-right --count ${branch}...${branch}@{upstream}`);
        const [ahead, behind] = counts.split("\t").map(Number);
        aheadCount = ahead ?? 0;
        behindCount = behind ?? 0;
      } catch { /* no upstream */ }
    }

    // PR status (via gh cli)
    let pr: GitStatusPr | null = null;
    if (branch) {
      try {
        const hasGh = await ghAvailable(cwd);
        if (hasGh) {
          const json = await ghExec(
            cwd,
            `pr view --head "${branch}" --json number,title,url,state,baseRefName,headRefName 2>/dev/null`,
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
        }
      } catch { /* gh not available or no PR */ }
    }

    return {
      branch,
      hasWorkingTreeChanges: hasChanges,
      workingTree: { files, insertions: totalInsertions, deletions: totalDeletions },
      hasUpstream,
      aheadCount,
      behindCount,
      pr,
    };
  }

  async listBranches(cwd: string): Promise<GitListBranchesResult> {
    const isGit = await this.isRepo(cwd);
    if (!isGit) return { branches: [], isRepo: false };

    try {
      const raw = await gitExec(cwd, "branch -a --format='%(HEAD) %(refname:short) %(upstream:short) %(worktreepath)'");
      const branches: GitBranch[] = [];
      const remotes = await this.listRemotes(cwd);
      const remoteSet = new Set(remotes);
      const preferredRemote = await this.getPreferredRemote(cwd);
      const defaultBranch = await gitExec(cwd, `symbolic-ref refs/remotes/${preferredRemote ?? "origin"}/HEAD 2>/dev/null || echo main`)
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

  async runStackedAction(
    cwd: string,
    action: GitStackedAction,
    commitMessage?: string,
    featureBranch?: boolean,
    baseBranch?: string,
  ): Promise<GitStepResult> {
    const result: GitStepResult = {
      commit: { status: "skipped_no_changes" },
      push: { status: "skipped_not_requested" },
      branch: { status: "skipped_not_requested" },
      pr: { status: "skipped_not_requested" },
    };

    // Optionally create a feature branch
    if (featureBranch) {
      const timestamp = Date.now().toString(36);
      const branchName = `feature/auto-${timestamp}`;
      await gitExec(cwd, `checkout -b "${branchName}"`);
      result.branch = { status: "created", name: branchName };
    }

    const currentBranch = await gitExec(cwd, "rev-parse --abbrev-ref HEAD").catch(() => null);

    // Commit step
    const porcelain = await gitExec(cwd, "status --porcelain").catch(() => "");
    if (porcelain.length > 0) {
      await gitExec(cwd, "add -A");

      let msg = commitMessage?.trim();
      if (!msg) {
        // Auto-generate a commit message from the diff summary
        try {
          const diffSummary = await gitExec(cwd, "diff --cached --stat");
          msg = `chore: auto-commit ${diffSummary.split("\n").length} file(s) changed`;
        } catch {
          msg = "chore: auto-commit changes";
        }
      }

      await gitExec(cwd, `commit -m "${msg.replace(/"/g, '\\"')}"`);
      const sha = await gitExec(cwd, "rev-parse HEAD");
      result.commit = { status: "created", commitSha: sha, subject: msg };
    }

    // Push step
    if (action === "commit_push" || action === "commit_push_pr") {
      if (currentBranch) {
        let hasUpstream = false;
        let upstreamBranch: string | undefined;
        try {
          upstreamBranch = await gitExec(cwd, `rev-parse --abbrev-ref ${currentBranch}@{upstream}`);
          hasUpstream = true;
        } catch { /* no upstream */ }

        if (hasUpstream) {
          try {
            await gitExec(cwd, "push");
            result.push = { status: "pushed", branch: currentBranch, upstreamBranch };
          } catch {
            // Already up-to-date or push failed — still proceed to PR
            result.push = { status: "pushed", branch: currentBranch, upstreamBranch };
          }
        } else {
          const remoteName = await this.getPreferredRemote(cwd, currentBranch);
          if (!remoteName) {
            result.push = { status: "skipped_no_remote", branch: currentBranch };
            // Don't return early — still try PR via gh CLI which may work
          } else {
            await gitExec(cwd, `push --set-upstream "${remoteName}" "${currentBranch}"`);
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
        result.push.createPrUrl = await this.buildCreatePrUrl(cwd, currentBranch, upstreamRemote);
      }
    }

    // PR creation step — try even if push was skipped (gh CLI can push internally)
    if (action === "commit_push_pr" && currentBranch) {
      try {
        const hasGh = await ghAvailable(cwd);
        if (!hasGh) {
          result.pr = { status: "skipped_not_requested" };
        } else {
          // Check if PR already exists
          try {
            const existing = await ghExec(
              cwd,
              `pr view --head "${currentBranch}" --json number,url,title,state,baseRefName,headRefName`,
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

          // Create new PR — use --push if branch wasn't pushed yet
          const prTitle = result.commit.subject ?? commitMessage?.trim() ?? `Changes from ${currentBranch}`;
          const baseFlag = baseBranch ? ` --base "${baseBranch}"` : '';
          const pushFlag = result.push.status !== "pushed" ? " --push" : "";
          const prJson = await ghExec(
            cwd,
            `pr create --title "${prTitle.replace(/"/g, '\\"')}" --body "Automated PR from Jait automation."${baseFlag}${pushFlag} --json number,url,title,baseRefName,headRefName`,
          );
          const parsed = JSON.parse(prJson) as Record<string, unknown>;
          result.pr = {
            status: "created",
            url: String(parsed.url ?? ""),
            number: Number(parsed.number ?? 0),
            baseBranch: String(parsed.baseRefName ?? ""),
            headBranch: String(parsed.headRefName ?? ""),
            title: String(parsed.title ?? prTitle),
          };
          // If gh pushed the branch for us, update push status
          if (result.push.status !== "pushed") {
            result.push = { status: "pushed", branch: currentBranch };
          }
        }
      } catch (err) {
        // PR creation failed — report as error with details
        const errMsg = err instanceof Error ? err.message : String(err);
        result.pr = { status: "skipped_no_remote" };
        if (result.push.status === "skipped_no_remote") {
          // Neither push nor PR worked — surface the real reason
          throw new Error(`Push failed (no remote configured) and PR creation failed: ${errMsg}`);
        }
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
  ): Promise<GitWorktreeResult> {
    const sanitized = newBranch.replace(/\//g, "-");
    const repoName = basename(cwd);
    const worktreePath =
      customPath ??
      join(homedir(), ".jait", "worktrees", repoName, sanitized);

    // Ensure parent directory exists
    await mkdir(join(worktreePath, ".."), { recursive: true });

    await gitExec(
      cwd,
      `worktree add -b "${newBranch}" "${worktreePath}" "${baseBranch}"`,
      60_000,
    );

    return { path: worktreePath, branch: newBranch };
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

  /** Get the top-level git directory (the main repo root, even from a worktree). */
  async getMainRepoRoot(cwd: string): Promise<string> {
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
    try {
      await gitExec(cwd, `remote get-url ${name}`);
      return true;
    } catch {
      return false;
    }
  }

  /** Get the remote URL for a named remote, or null if not set. */
  async getRemoteUrl(cwd: string, name: string): Promise<string | null> {
    try {
      return (await gitExec(cwd, `remote get-url ${name}`)).trim() || null;
    } catch {
      return null;
    }
  }

  /** List configured remote names. */
  async listRemotes(cwd: string): Promise<string[]> {
    const raw = await gitExec(cwd, "remote").catch(() => "");
    return raw
      .split("\n")
      .map((r) => r.trim())
      .filter(Boolean);
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
      const configuredRemote = await gitExec(cwd, `config --get branch.${branch}.remote`).catch(() => "");
      if (configuredRemote && remotes.includes(configuredRemote)) {
        return configuredRemote;
      }
    }

    if (remotes.includes("origin")) return "origin";
    return remotes[0] ?? null;
  }

  /**
   * Build a URL to create a new pull request on the hosting provider.
   * Supports GitHub, GitLab, Bitbucket, and Azure DevOps remote URLs.
   */
  async buildCreatePrUrl(cwd: string, branch: string, remoteName?: string): Promise<string | undefined> {
    const preferredRemote = remoteName ?? await this.getPreferredRemote(cwd, branch);
    if (!preferredRemote) return undefined;
    const raw = await this.getRemoteUrl(cwd, preferredRemote);
    if (!raw) return undefined;

    // Normalise SSH / HTTPS remote URL → "https://host/owner/repo"
    let url = raw
      .replace(/\.git$/, "")
      .replace(/^git@([^:]+):(.+)$/, "https://$1/$2")
      .replace(/^ssh:\/\/git@([^/]+)\/(.+)$/, "https://$1/$2");

    // GitHub
    if (url.includes("github.com")) {
      return `${url}/compare/${encodeURIComponent(branch)}?expand=1`;
    }
    // GitLab
    if (url.includes("gitlab")) {
      return `${url}/-/merge_requests/new?merge_request[source_branch]=${encodeURIComponent(branch)}`;
    }
    // Bitbucket
    if (url.includes("bitbucket")) {
      return `${url}/pull-requests/new?source=${encodeURIComponent(branch)}`;
    }
    // Azure DevOps
    if (url.includes("dev.azure.com") || url.includes("visualstudio.com")) {
      return `${url}/pullrequestcreate?sourceRef=${encodeURIComponent(branch)}`;
    }

    return undefined;
  }

  /** Return the diff of uncommitted changes (staged + unstaged). */
  async diff(cwd: string): Promise<GitDiffResult> {
    const isGit = await this.isRepo(cwd);
    if (!isGit) return { diff: "", files: [], hasChanges: false };

    // Combine staged and unstaged diff
    let diffText = "";
    try {
      const staged = await gitExec(cwd, "diff --cached").catch(() => "");
      const unstaged = await gitExec(cwd, "diff").catch(() => "");
      diffText = [staged, unstaged].filter(Boolean).join("\n");
    } catch { /* ignore */ }

    // Also include untracked files as a summary
    const porcelain = await gitExec(cwd, "status --porcelain").catch(() => "");
    const untrackedFiles = porcelain
      .split("\n")
      .filter((l) => l.startsWith("??"))
      .map((l) => l.slice(3).trim())
      .filter(Boolean);

    if (untrackedFiles.length > 0) {
      const untrackedSection = untrackedFiles.map((f) => `+++ new file: ${f}`).join("\n");
      diffText = diffText ? `${diffText}\n\n# Untracked files:\n${untrackedSection}` : `# Untracked files:\n${untrackedSection}`;
    }

    const files = porcelain
      .split("\n")
      .filter(Boolean)
      .map((l) => l.slice(3).trim())
      .filter(Boolean);

    return {
      diff: diffText,
      files,
      hasChanges: files.length > 0,
    };
  }

  /**
   * Return per-file original and modified content so the frontend can
   * render a Monaco diff editor.
   *
   * @param baseBranch — when given, diff working tree against that branch
   *   (shows all thread changes: committed + uncommitted). When omitted,
   *   only uncommitted working-tree changes are returned (original = HEAD).
   */
  async fileDiffs(cwd: string, baseBranch?: string): Promise<FileDiffEntry[]> {
    const isGit = await this.isRepo(cwd);
    if (!isGit) return [];

    if (baseBranch) {
      return this.fileDiffsBranch(cwd, baseBranch);
    }

    const porcelain = await gitExec(cwd, "status --porcelain").catch(() => "");
    const lines = porcelain.split("\n").filter(Boolean);
    const entries: FileDiffEntry[] = [];

    for (const line of lines) {
      const xy = line.slice(0, 2);
      let filePath = line.slice(3).trim();

      // Handle renames: "R  old -> new"
      if (filePath.includes(" -> ")) {
        filePath = filePath.split(" -> ").pop()!.trim();
      }

      // Determine status code
      let status = "M";
      if (xy.includes("?")) status = "?";
      else if (xy.includes("A")) status = "A";
      else if (xy.includes("D")) status = "D";
      else if (xy.includes("R")) status = "R";

      // Get original from HEAD
      let original = "";
      if (status !== "A" && status !== "?") {
        try {
          original = await gitExec(cwd, `show HEAD:${JSON.stringify(filePath)}`);
        } catch {
          original = "";
        }
      }

      // Get current working tree content
      let modified = "";
      if (status !== "D") {
        try {
          modified = await readFile(join(cwd, filePath), "utf-8");
        } catch {
          modified = "";
        }
      }

      entries.push({ path: filePath, original, modified, status });
    }

    return entries;
  }

  /**
   * Diff working tree against a base branch (shows all committed + uncommitted changes).
   */
  private async fileDiffsBranch(cwd: string, baseBranch: string): Promise<FileDiffEntry[]> {
    // Get list of files that differ between baseBranch and working tree
    const nameStatus = await gitExec(cwd, `diff --name-status ${baseBranch}`).catch(() => "");
    const lines = nameStatus.split("\n").filter(Boolean);
    const entries: FileDiffEntry[] = [];
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

      let original = "";
      if (status !== "A") {
        try {
          original = await gitExec(cwd, `show ${baseBranch}:${JSON.stringify(filePath)}`);
        } catch { original = ""; }
      }

      let modified = "";
      if (status !== "D") {
        try {
          modified = await readFile(join(cwd, filePath), "utf-8");
        } catch { modified = ""; }
      }

      entries.push({ path: filePath, original, modified, status });
    }

    // Also include untracked files that aren't already listed
    const porcelain = await gitExec(cwd, "status --porcelain").catch(() => "");
    for (const pl of porcelain.split("\n").filter(Boolean)) {
      if (!pl.startsWith("??")) continue;
      const fp = pl.slice(3).trim();
      if (!fp || seen.has(fp)) continue;
      seen.add(fp);
      let modified = "";
      try { modified = await readFile(join(cwd, fp), "utf-8"); } catch { /* skip */ }
      entries.push({ path: fp, original: "", modified, status: "?" });
    }

    return entries;
  }
}
