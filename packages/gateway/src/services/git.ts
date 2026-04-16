/**
 * Server-side git operations service.
 *
 * Executes git and `gh` CLI commands in the requested working directory.
 * Adapted from the t3code GitService/GitManager pattern but running
 * directly through child_process on the gateway.
 */

import { exec as execCb } from "node:child_process";
import { readFile, writeFile, unlink, mkdir, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { promisify } from "node:util";

const _exec = promisify(execCb);
function exec(cmd: string, opts?: Record<string, unknown>) {
  return _exec(cmd, { encoding: "utf-8" as const, windowsHide: true, ...opts });
}
const DEFAULT_TIMEOUT = 30_000;

function trimCommandOutput(stdout: string): string {
  return stdout.replace(/\r?\n$/, "");
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

// ── Helpers ────────────────────────────────────────────────────────

async function gitExec(cwd: string, args: string, timeout = DEFAULT_TIMEOUT): Promise<string> {
  const { stdout } = await exec(`git ${args}`, { cwd, timeout });
  return trimCommandOutput(stdout);
}

function gitRevisionPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\.\/+/, "");
  return `./${normalized}`;
}

function ghCleanEnv(): NodeJS.ProcessEnv {
  const { GH_REPO, GH_HOST, GH_TOKEN, GITHUB_TOKEN, ...rest } = process.env;
  return rest;
}

async function ghExec(cwd: string, args: string, timeout = DEFAULT_TIMEOUT): Promise<string> {
  const { stdout } = await exec(`gh ${args}`, { cwd, timeout, env: ghCleanEnv() });
  return trimCommandOutput(stdout);
}

async function ghAvailable(cwd: string): Promise<boolean> {
  try {
    await exec("gh --version", { cwd, timeout: 5_000, env: ghCleanEnv() });
    return true;
  } catch {
    return false;
  }
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
    const effectiveToken = await resolveGithubTokenWithFallback(githubToken);
    const isGit = await this.isRepo(cwd);
    if (!isGit) {
      return {
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

    // Build per-file staged/unstaged status maps from porcelain output
    const indexStatusMap = new Map<string, string>();
    const workingTreeStatusMap = new Map<string, string>();
    for (const line of porcelain.split("\n").filter(Boolean)) {
      const xy = line.slice(0, 2);
      const staged = xy[0] ?? " ";
      const unstaged = xy[1] ?? " ";
      // Strip the two status columns plus any whitespace, without chopping off the first path character.
      let fp = line.replace(/^[ MADRCU?!]{2}\s+/, "");
      if (fp.includes(" -> ")) fp = fp.split(" -> ").pop()!.trim();
      if (!fp) continue;
      if (xy === "??") {
        workingTreeStatusMap.set(fp, "?");
        continue;
      }
      if (staged !== " ") indexStatusMap.set(fp, normalizeStatusChar(staged));
      if (unstaged !== " ") workingTreeStatusMap.set(fp, normalizeStatusChar(unstaged));
    }

    // Diff stats for staged and unstaged files
    const indexFiles: GitStatusFile[] = [];
    const workingTreeFiles: GitStatusFile[] = [];
    let indexInsertions = 0;
    let indexDeletions = 0;
    let workingTreeInsertions = 0;
    let workingTreeDeletions = 0;
    if (hasChanges) {
      try {
        const stagedDiffStat = await gitExec(cwd, "diff --cached --numstat").catch(() => "");
        for (const line of stagedDiffStat.split("\n").filter(Boolean)) {
          const [ins, del, filePath] = line.split("\t");
          const insertions = ins === "-" ? 0 : parseInt(ins ?? "0", 10);
          const deletions = del === "-" ? 0 : parseInt(del ?? "0", 10);
          if (filePath) {
            indexFiles.push({ path: filePath, insertions, deletions, status: indexStatusMap.get(filePath) ?? "M" });
            indexInsertions += insertions;
            indexDeletions += deletions;
          }
        }

        const workingTreeDiffStat = await gitExec(cwd, "diff --numstat").catch(() => "");
        for (const line of workingTreeDiffStat.split("\n").filter(Boolean)) {
          const [ins, del, filePath] = line.split("\t");
          const insertions = ins === "-" ? 0 : parseInt(ins ?? "0", 10);
          const deletions = del === "-" ? 0 : parseInt(del ?? "0", 10);
          if (filePath) {
            workingTreeFiles.push({ path: filePath, insertions, deletions, status: workingTreeStatusMap.get(filePath) ?? "M" });
            workingTreeInsertions += insertions;
            workingTreeDeletions += deletions;
          }
        }

        for (const [filePath, status] of workingTreeStatusMap) {
          if (!workingTreeFiles.some((f) => f.path === filePath)) {
            workingTreeFiles.push({ path: filePath, insertions: 0, deletions: 0, status });
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

  async bumpWorkspacePackageVersions(cwd: string): Promise<GitVersionBumpResult> {
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
      throw new Error("No bumpable package.json version fields found in this workspace.");
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

    const version = await this.bumpWorkspacePackageVersions(cwd);
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
    let upstream: string | null = null;
    try {
      upstream = await gitExec(cwd, `rev-parse --abbrev-ref ${branch}@{upstream}`);
    } catch {
      upstream = null;
    }

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

      try {
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
      } catch (err) {
        // Unstage so we don't leave stale staged files behind
        await gitExec(cwd, "reset HEAD").catch(() => {});
        throw err;
      }
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
        result.push.createPrUrl = await this.buildCreatePrUrl(cwd, currentBranch, upstreamRemote, baseBranch);
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
        const manualUrl = result.push.createPrUrl ?? (preferredRemote
          ? await this.buildCreatePrUrl(cwd, currentBranch, preferredRemote, baseBranch)
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
          const resolvedBase = baseBranch || await this.resolveDefaultBranch(cwd, remoteUrl);
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
        } else if (parsedRemote?.provider === "github" && githubRemote && effectiveToken) {
          const resolvedBase = baseBranch || await this.resolveDefaultBranch(cwd, remoteUrl);
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
          const resolvedBase = baseBranch || await this.resolveDefaultBranch(cwd, remoteUrl);
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
                baseBranch: baseBranch ?? undefined,
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
   * deletes the associated branch, and falls back to deleting the
   * directory if the worktree remove fails.
   * No-ops silently when the path is not a worktree or doesn't exist.
   */
  async cleanupWorktree(worktreePath: string, branch?: string | null): Promise<void> {
    if (!worktreePath || !existsSync(worktreePath)) return;
    // Only act on paths that live inside the managed worktrees directory
    const worktreeMarker = join(".jait", "worktrees");
    if (!worktreePath.includes(worktreeMarker)) return;

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
    if (branch && mainRoot) {
      await this.deleteBranch(mainRoot, branch);
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
      return `${parsed.normalizedUrl}/compare/${encodeURIComponent(branch)}?expand=1`;
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

  async diffStats(cwd: string, baseBranch?: string, branch?: string): Promise<GitDiffStatsResult> {
    const isGit = await this.isRepo(cwd);
    if (!isGit) {
      return { files: 0, insertions: 0, deletions: 0, hasChanges: false };
    }

    const filePaths = new Set<string>();
    let insertions = 0;
    let deletions = 0;

    const collectNumstat = async (args: string): Promise<void> => {
      const numstat = await gitExec(cwd, args).catch(() => "");
      for (const line of numstat.split("\n").filter(Boolean)) {
        const [ins, del, filePath] = line.split("\t");
        if (!filePath) continue;
        filePaths.add(filePath);
        insertions += ins === "-" ? 0 : parseInt(ins ?? "0", 10);
        deletions += del === "-" ? 0 : parseInt(del ?? "0", 10);
      }
    };

    if (baseBranch && branch) {
      await collectNumstat(`diff --numstat ${JSON.stringify(baseBranch)} ${JSON.stringify(branch)}`);
    } else if (baseBranch) {
      await collectNumstat(`diff --numstat ${JSON.stringify(baseBranch)}`);
    } else {
      await collectNumstat("diff --cached --numstat");
      await collectNumstat("diff --numstat");
    }

    const porcelain = await gitExec(cwd, "status --porcelain").catch(() => "");
    for (const line of porcelain.split("\n").filter(Boolean)) {
      if (!line.startsWith("??")) continue;
      const filePath = line.slice(3).trim();
      if (filePath) filePaths.add(filePath);
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
          original = await gitExec(cwd, `show HEAD:${JSON.stringify(gitRevisionPath(filePath))}`);
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
          original = await gitExec(cwd, `show ${baseBranch}:${JSON.stringify(gitRevisionPath(filePath))}`);
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
  branch?: string | null,
): Promise<void> {
  if (!worktreePath) return;

  // If path exists locally, use local cleanup
  if (existsSync(worktreePath)) {
    const svc = new GitService();
    await svc.cleanupWorktree(worktreePath, branch);
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
