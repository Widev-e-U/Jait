/**
 * Server-side git operations service.
 *
 * Executes git and `gh` CLI commands in the requested working directory.
 * Adapted from the t3code GitService/GitManager pattern but running
 * directly through child_process on the gateway.
 */

import { exec as execCb } from "node:child_process";
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
  push: { status: "pushed" | "skipped_not_requested" | "skipped_up_to_date"; branch?: string; upstreamBranch?: string; setUpstream?: boolean };
  branch: { status: "created" | "skipped_not_requested"; name?: string };
  pr: { status: "created" | "opened_existing" | "skipped_not_requested"; url?: string; number?: number; baseBranch?: string; headBranch?: string; title?: string };
}

export interface GitPullResult {
  status: "pulled" | "skipped_up_to_date";
  branch: string;
  upstreamBranch: string | null;
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

  async status(cwd: string): Promise<GitStatusResult> {
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
      const defaultBranch = await gitExec(cwd, "symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || echo main")
        .then((r) => r.replace("refs/remotes/origin/", "").trim())
        .catch(() => "main");

      for (const line of raw.split("\n").filter(Boolean)) {
        const clean = line.replace(/^'|'$/g, "").trim();
        const current = clean.startsWith("*");
        const parts = clean.replace(/^\*?\s*/, "").split(/\s+/);
        const name = parts[0] ?? "";
        const isRemote = name.startsWith("origin/");
        const worktreePath = parts.length > 2 ? parts.slice(2).join(" ") || null : null;
        if (!name || name === "origin/HEAD") continue;
        branches.push({
          name: isRemote ? name.replace(/^origin\//, "") : name,
          isRemote,
          current,
          isDefault: name === defaultBranch || name === `origin/${defaultBranch}`,
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
        try {
          await gitExec(cwd, `rev-parse --abbrev-ref ${currentBranch}@{upstream}`);
          hasUpstream = true;
        } catch { /* no upstream */ }

        if (hasUpstream) {
          await gitExec(cwd, "push");
          result.push = { status: "pushed", branch: currentBranch };
        } else {
          await gitExec(cwd, `push --set-upstream origin "${currentBranch}"`);
          result.push = { status: "pushed", branch: currentBranch, setUpstream: true };
        }
      }
    }

    // PR creation step
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

          // Create new PR
          const prTitle = result.commit.subject ?? `Changes from ${currentBranch}`;
          const prJson = await ghExec(
            cwd,
            `pr create --title "${prTitle.replace(/"/g, '\\"')}" --body "Automated PR from Jait automation." --json number,url,title,baseRefName,headRefName`,
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
        }
      } catch (err) {
        // PR creation failed but commit/push succeeded
        result.pr = { status: "skipped_not_requested" };
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
}
