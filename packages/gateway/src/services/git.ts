/**
 * Server-side git operations service.
 *
 * Executes git and `gh` CLI commands in the requested working directory.
 * Adapted from the t3code GitService/GitManager pattern but running
 * directly through child_process on the gateway.
 */

import { exec as execCb } from "node:child_process";
import { readFile, writeFile, unlink, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir, tmpdir } from "node:os";
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
  /** Whether GitHub CLI (`gh`) is installed and authenticated. */
  ghAvailable: boolean;
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

export interface PrCheck {
  name: string;
  state: string;
  conclusion: string;
  startedAt: string;
  completedAt: string;
  detailsUrl: string;
}

// ── Helpers ────────────────────────────────────────────────────────

async function gitExec(cwd: string, args: string, timeout = DEFAULT_TIMEOUT): Promise<string> {
  const { stdout } = await exec(`git ${args}`, { cwd, timeout });
  return stdout.trim();
}

function ghCleanEnv(): NodeJS.ProcessEnv {
  const { GH_TOKEN, GITHUB_TOKEN, ...rest } = process.env;
  return rest;
}

async function ghExec(cwd: string, args: string, timeout = DEFAULT_TIMEOUT): Promise<string> {
  const { stdout } = await exec(`gh ${args}`, { cwd, timeout, env: ghCleanEnv() });
  return stdout.trim();
}

async function ghAvailable(cwd: string): Promise<boolean> {
  try {
    await exec("gh --version", { cwd, timeout: 5_000, env: ghCleanEnv() });
    return true;
  } catch {
    return false;
  }
}

function parseGithubRemote(raw: string | null): { host: string; owner: string; repo: string } | null {
  if (!raw) return null;
  // Normalise to https URL
  let url = raw.replace(/\.git$/, "");
  url = url.replace(/^git@([^:]+):(.+)$/, "https://$1/$2");
  url = url.replace(/^ssh:\/\/git@([^/]+)\/(.+)$/, "https://$1/$2");

  try {
    const u = new URL(url);
    const parts = u.pathname.replace(/^\/+|\/+$/g, "").split("/");
    if (!u.hostname.includes("github") || parts.length < 2) return null;
    const repo = parts.pop()!;
    const owner = parts.pop()!;
    return { host: u.hostname, owner, repo };
  } catch {
    return null;
  }
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
      const proc = spawn("git", ["credential", "fill"], { timeout: 5_000 });
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

  async status(cwd: string, requestedBranch?: string, githubToken?: string): Promise<GitStatusResult> {
    const effectiveToken = await resolveGithubTokenWithFallback(githubToken);
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
        ghAvailable: false,
        remoteUrl: null,
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
        const diffStat = await gitExec(cwd, "diff --numstat HEAD").catch(() => gitExec(cwd, "diff --numstat"));
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
    let ghIsAvailable = false;
    const prBranch = requestedBranch ?? branch;
    if (prBranch) {
      try {
        const hasGh = await ghAvailable(cwd);
        ghIsAvailable = hasGh;
        if (hasGh) {
          const json = await ghExec(
            cwd,
            `pr view "${prBranch}" --json number,title,url,state,baseRefName,headRefName`,
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
            const remoteName = await this.getPreferredRemote(cwd, prBranch);
            const remoteUrl = await this.getRemoteUrl(cwd, remoteName ?? "");
            const githubRemote = parseGithubRemote(remoteUrl);
            if (githubRemote) {
              const apiPr = await this.fetchGithubPrByHead(githubRemote, effectiveToken, prBranch);
              if (apiPr) pr = apiPr;
            }
          }
        }
      } catch { /* gh not available or no PR */ }
    }

    // Resolve remote URL
    let remoteUrl: string | null = null;
    try {
      const preferredRemote = await this.getPreferredRemote(cwd, branch ?? undefined);
      remoteUrl = await this.getRemoteUrl(cwd, preferredRemote ?? "origin");
    } catch { /* no remote */ }

    return {
      branch,
      hasWorkingTreeChanges: hasChanges,
      workingTree: { files, insertions: totalInsertions, deletions: totalDeletions },
      hasUpstream,
      aheadCount,
      behindCount,
      pr,
      ghAvailable: ghIsAvailable,
      remoteUrl,
    };
  }

  /** Fetch CI check statuses for a PR branch via `gh pr checks`. */
  async prChecks(cwd: string, branch: string): Promise<PrCheck[]> {
    try {
      const hasGh = await ghAvailable(cwd);
      if (!hasGh) return [];
      const json = await ghExec(cwd, `pr checks "${branch}" --json name,state,conclusion,startedAt,completedAt,detailsUrl`);
      if (!json) return [];
      return JSON.parse(json) as PrCheck[];
    } catch {
      return [];
    }
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

  async runStackedAction(
    cwd: string,
    action: GitStackedAction,
    commitMessage?: string,
    featureBranch?: boolean,
    baseBranch?: string,
    githubToken?: string,
  ): Promise<GitStepResult> {
    const effectiveToken = await resolveGithubTokenWithFallback(githubToken);
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
            await gitExec(cwd, "push --no-verify");
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
        result.push.createPrUrl = await this.buildCreatePrUrl(cwd, currentBranch, upstreamRemote);
      }
    }

    // PR creation step — try even if push was skipped (gh CLI can push internally)
    if (action === "commit_push_pr" && currentBranch) {
      try {
        const hasGh = await ghAvailable(cwd);
        const preferredRemote = await this.getPreferredRemote(cwd, currentBranch);
        const remoteUrl = await this.getRemoteUrl(cwd, preferredRemote ?? "");
        const githubRemote = parseGithubRemote(remoteUrl);

        if (!hasGh && !effectiveToken) {
          const manualUrl = result.push.createPrUrl ?? (preferredRemote ? await this.buildCreatePrUrl(cwd, currentBranch, preferredRemote) : undefined);
          const hint = manualUrl ? ` Open ${manualUrl} to create the PR manually.` : "";
          throw new Error(`Cannot create pull request automatically because GitHub CLI is not installed and no GITHUB_TOKEN is configured.${hint}`);
        }

        if (hasGh) {
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
          const prTitle = result.commit.subject ?? commitMessage?.trim() ?? `Changes from ${currentBranch}`;
          const baseFlag = baseBranch ? ` --base "${baseBranch}"` : '';

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
          const resolvedBase = baseBranch || await this.resolveDefaultBranch(cwd);
          const prBody = await this.generatePrBody(cwd, resolvedBase, currentBranch, prTitle);

          // Write body to temp file (avoids shell escaping issues with markdown)
          const bodyFile = join(tmpdir(), `jait-pr-body-${Date.now()}.md`);
          await writeFile(bodyFile, prBody, "utf-8");

          try {
            // gh pr create outputs the PR URL on stdout (--json is not supported)
            const prUrl = await ghExec(
              cwd,
              `pr create --title "${prTitle.replace(/"/g, '\\"')}" --body-file "${bodyFile}"${baseFlag}`,
              60_000,
            );

            // Fetch full PR details via gh pr view
            let prNumber = 0;
            let prBaseBranch = baseBranch ?? "";
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
        } else if (githubRemote && effectiveToken) {
          const resolvedBase = baseBranch || await this.resolveDefaultBranch(cwd);
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
        } else {
          result.pr = { status: "skipped_not_requested" };
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
  ): Promise<string> {
    const clonePath = join(homedir(), ".jait", "clones", repoName);

    if (existsSync(join(clonePath, ".git"))) {
      // Already cloned — fetch latest
      await gitExec(clonePath, "fetch origin", 60_000);
      await gitExec(clonePath, `checkout "${defaultBranch}"`, 30_000).catch(() => {});
      await gitExec(clonePath, `reset --hard "origin/${defaultBranch}"`, 30_000).catch(() => {});
      return clonePath;
    }

    // Fresh clone
    await mkdir(join(clonePath, ".."), { recursive: true });
    const { exec: execP } = await import("node:child_process");
    const { promisify: pfy } = await import("node:util");
    const run = pfy(execP);
    await run(`git clone --branch "${defaultBranch}" "${repoUrl}" "${clonePath}"`, {
      timeout: 120_000,
    });

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

  /**
   * Clean up a worktree directory created for a thread.
   * Resolves the main repo root, runs `git worktree remove --force`,
   * and falls back to deleting the directory if that fails.
   * No-ops silently when the path is not a worktree or doesn't exist.
   */
  async cleanupWorktree(worktreePath: string): Promise<void> {
    if (!worktreePath || !existsSync(worktreePath)) return;
    // Only act on paths that live inside the managed worktrees directory
    const worktreeMarker = join(".jait", "worktrees");
    if (!worktreePath.includes(worktreeMarker)) return;

    try {
      const mainRoot = await this.getMainRepoRoot(worktreePath);
      await this.removeWorktree(mainRoot, worktreePath, true);
    } catch {
      // git worktree remove may fail (dirty tree, missing refs, etc.).
      // Fall back to a plain directory removal so we don't leak disk space.
      try {
        await rm(worktreePath, { recursive: true, force: true });
      } catch { /* best effort */ }
    }
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
   * Resolve the repository's default branch (e.g. "main" or "master").
   * Tries gh CLI first, then falls back to common defaults.
   */
  async resolveDefaultBranch(cwd: string): Promise<string> {
    try {
      const json = await ghExec(cwd, "repo view --json defaultBranchRef", 15_000);
      const parsed = JSON.parse(json) as Record<string, unknown>;
      const ref = parsed.defaultBranchRef as Record<string, unknown> | undefined;
      if (ref?.name) return String(ref.name);
    } catch { /* gh not available or not a github repo */ }

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

    sections.push(`---\n*PR created by [Jait](https://github.com/JakobWl/Jait) automation.*`);

    return sections.join("\n");
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

/**
 * Clean up a worktree, proxying to a remote FsNode when the path
 * doesn't exist locally (e.g. a Windows worktree on a Linux gateway).
 */
export async function cleanupWorktreeRemoteAware(
  worktreePath: string,
  ws?: { proxyFsOp<T = unknown>(nodeId: string, op: string, params: Record<string, unknown>, timeout: number): Promise<T>; getFsNodes(): { id: string; isGateway?: boolean; platform?: string }[] },
): Promise<void> {
  if (!worktreePath) return;

  // If path exists locally, use local cleanup
  if (existsSync(worktreePath)) {
    const svc = new GitService();
    await svc.cleanupWorktree(worktreePath);
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
