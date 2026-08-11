import { spawn } from "node:child_process";
import type {
  PullRequestActor,
  PullRequestCheck,
  PullRequestCommit,
  PullRequestComment,
  PullRequestConflictFile,
  PullRequestConflictSide,
  PullRequestDetail,
  PullRequestDiff,
  PullRequestFile,
  PullRequestLabel,
  PullRequestListState,
  PullRequestMergeMethod,
  PullRequestResolveResult,
  PullRequestReview,
  PullRequestReviewEvent,
  PullRequestState,
  PullRequestSummary,
} from "@jait/shared";
import {
  GitService,
  ghExecArgs,
  gitExecArgs,
  gitExecBufferArgs,
  parseGitRemote,
  type GitArgExecOptions,
} from "./git.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_JSON_OUTPUT_BYTES = 10 * 1024 * 1024;
const MAX_DIFF_OUTPUT_BYTES = 2 * 1024 * 1024;

export const GITHUB_TOKEN_SECRET_TYPE = "forge-token";
export const GITHUB_TOKEN_SECRET_KEY = "github.com";

interface GhResult {
  stdout: string;
  stderr: string;
}

type GhRunner = (
  args: string[],
  options?: { input?: string; maxOutputBytes?: number },
) => Promise<GhResult>;

function githubTokenEnv(token: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.GH_REPO;
  delete env.GH_HOST;
  delete env.GH_TOKEN;
  delete env.GITHUB_TOKEN;
  return { ...env, GH_TOKEN: token };
}

function githubGitAuthOptions(token: string): GitArgExecOptions {
  const encodedCredential = Buffer.from(`x-access-token:${token}`).toString("base64");
  const authorizationHeader = `AUTHORIZATION: basic ${encodedCredential}`;
  const parsedConfigCount = Number.parseInt(process.env.GIT_CONFIG_COUNT ?? "0", 10);
  const configIndex = Number.isInteger(parsedConfigCount) && parsedConfigCount >= 0
    ? parsedConfigCount
    : 0;
  return {
    env: {
      ...process.env,
      GIT_CONFIG_COUNT: String(configIndex + 1),
      [`GIT_CONFIG_KEY_${configIndex}`]: "http.extraHeader",
      [`GIT_CONFIG_VALUE_${configIndex}`]: authorizationHeader,
    },
    redactions: [token, encodedCredential, authorizationHeader],
  };
}

export interface PullRequestConflictGitOperations {
  cloneOrFetch(
    repoUrl: string,
    repoName: string,
    defaultBranch?: string,
    options?: GitArgExecOptions,
  ): Promise<string>;
  git(cwd: string, args: string[], timeout?: number, options?: GitArgExecOptions): Promise<string>;
  gitBuffer(cwd: string, args: string[], timeout?: number, options?: GitArgExecOptions): Promise<Buffer>;
  gh(cwd: string, args: string[], timeout?: number, options?: GitArgExecOptions): Promise<string>;
}

function createConflictGitOperations(githubToken: string | null): PullRequestConflictGitOperations {
  const service = new GitService();
  const authOptions = githubToken ? githubGitAuthOptions(githubToken) : undefined;
  const requireToken = () => {
    if (!githubToken || !authOptions) {
      throw new Error("GitHub authentication is required. Sign in to GitHub for this account.");
    }
    return authOptions;
  };
  return {
    cloneOrFetch: (repoUrl, repoName, defaultBranch) => service.cloneOrFetch(
      repoUrl,
      repoName,
      defaultBranch,
      requireToken(),
    ),
    git: gitExecArgs,
    gitBuffer: gitExecBufferArgs,
    gh: (cwd, args, timeout) => {
      requireToken();
      return ghExecArgs(cwd, args, timeout, {
        env: githubTokenEnv(githubToken!),
        redactions: [githubToken!],
      });
    },
  };
}

const conflictOperationLocks = new Map<string, Promise<unknown>>();

function withConflictOperationLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = conflictOperationLocks.get(key) ?? Promise.resolve();
  const next = previous.then(operation, operation);
  conflictOperationLocks.set(key, next);
  void next.catch(() => {}).finally(() => {
    if (conflictOperationLocks.get(key) === next) conflictOperationLocks.delete(key);
  });
  return next;
}

function assertSafeConflictPath(path: string): void {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/");
  const hasControlCharacter = Array.from(path).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (
    !path
    || normalized.startsWith("/")
    || /^[a-zA-Z]:\//.test(normalized)
    || normalized === "."
    || hasControlCharacter
    || segments.some((segment) => segment === ".." || segment.toLowerCase() === ".git")
  ) {
    throw new Error("Git reported an unsafe conflict path.");
  }
}

function sanitizeHttpsRemote(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    url.username = "";
    url.password = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function decodeConflictText(content: Buffer): string | null {
  if (content.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    return null;
  }
}

function runGh(
  args: string[],
  options: { input?: string; maxOutputBytes?: number } | undefined,
  githubToken: string | null,
): Promise<GhResult> {
  if (!githubToken) {
    return Promise.reject(new Error(
      "GitHub authentication is required. Sign in to GitHub for this account.",
    ));
  }
  const maxOutputBytes = options?.maxOutputBytes ?? MAX_JSON_OUTPUT_BYTES;
  return new Promise((resolve, reject) => {
    const child = spawn("gh", args, {
      env: githubTokenEnv(githubToken),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: NodeJS.Timeout | undefined;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
    };

    const append = (current: string, chunk: Buffer): string => {
      const next = current + chunk.toString("utf8");
      if (Buffer.byteLength(next, "utf8") > maxOutputBytes) {
        child.kill("SIGTERM");
        finish(new Error("GitHub response was too large to display in Jait."));
      }
      return next;
    };

    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        const message = stderr.trim() || `GitHub CLI exited with code ${code ?? "unknown"}.`;
        finish(new Error(message.split(githubToken).join("[REDACTED]")));
        return;
      }
      finish();
    });

    timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new Error("GitHub request timed out."));
    }, DEFAULT_TIMEOUT_MS);

    child.stdin.end(options?.input);
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function actor(value: unknown): PullRequestActor | null {
  const raw = asRecord(value);
  const login = asString(raw.login).trim();
  if (!login) return null;
  const name = asString(raw.name).trim();
  return { login, name: name || null };
}

function state(value: unknown): PullRequestState {
  const normalized = asString(value).toUpperCase();
  if (normalized === "MERGED") return "MERGED";
  if (normalized === "CLOSED") return "CLOSED";
  return "OPEN";
}

function labels(value: unknown): PullRequestLabel[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const raw = asRecord(item);
    return { name: asString(raw.name), color: asString(raw.color) };
  }).filter((label) => label.name);
}

function checks(value: unknown): PullRequestCheck[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const raw = asRecord(item);
    return {
      name: asString(raw.name) || asString(raw.context) || "Check",
      status: asString(raw.status) || asString(raw.state),
      conclusion: asString(raw.conclusion) || asString(raw.state),
      detailsUrl: (asString(raw.detailsUrl) || asString(raw.targetUrl)).trim() || null,
    };
  });
}

function summary(value: unknown): PullRequestSummary {
  const raw = asRecord(value);
  return {
    number: Number(raw.number ?? 0),
    title: asString(raw.title),
    state: state(raw.state),
    url: asString(raw.url),
    author: actor(raw.author),
    baseBranch: asString(raw.baseRefName),
    headBranch: asString(raw.headRefName),
    isDraft: Boolean(raw.isDraft),
    reviewDecision: asString(raw.reviewDecision),
    mergeStateStatus: asString(raw.mergeStateStatus),
    additions: Number(raw.additions ?? 0),
    deletions: Number(raw.deletions ?? 0),
    changedFiles: Number(raw.changedFiles ?? 0),
    createdAt: asString(raw.createdAt),
    updatedAt: asString(raw.updatedAt),
    labels: labels(raw.labels),
    checks: checks(raw.statusCheckRollup),
  };
}

function comments(value: unknown): PullRequestComment[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const raw = asRecord(item);
    return {
      id: asString(raw.id),
      author: actor(raw.author),
      body: asString(raw.body),
      createdAt: asString(raw.createdAt),
      url: asString(raw.url).trim() || null,
    };
  });
}

function reviews(value: unknown): PullRequestReview[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const raw = asRecord(item);
    return {
      id: asString(raw.id),
      author: actor(raw.author),
      body: asString(raw.body),
      state: asString(raw.state),
      submittedAt: asString(raw.submittedAt),
    };
  });
}

function commits(value: unknown): PullRequestCommit[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const raw = asRecord(item);
    const rawAuthors = Array.isArray(raw.authors) ? raw.authors : [];
    return {
      oid: asString(raw.oid),
      message: asString(raw.messageHeadline),
      authoredAt: asString(raw.authoredDate) || asString(raw.committedDate),
      authors: rawAuthors.map(actor).filter((item): item is PullRequestActor => Boolean(item)),
    };
  });
}

function files(value: unknown): PullRequestFile[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const raw = asRecord(item);
    return {
      path: asString(raw.path),
      additions: Number(raw.additions ?? 0),
      deletions: Number(raw.deletions ?? 0),
    };
  }).filter((file) => file.path);
}

const LIST_FIELDS = [
  "number", "title", "state", "url", "author", "baseRefName", "headRefName",
  "isDraft", "reviewDecision", "mergeStateStatus", "additions", "deletions",
  "changedFiles", "createdAt", "updatedAt", "labels", "statusCheckRollup",
].join(",");

const DETAIL_FIELDS = `${LIST_FIELDS},body,mergeable,maintainerCanModify,comments,reviews,commits,files`;

export class GitHubPullRequestService {
  private readonly runner: GhRunner;
  private readonly conflictGit: PullRequestConflictGitOperations;
  private readonly githubToken: string | null;

  constructor(
    runner?: GhRunner,
    conflictGit?: PullRequestConflictGitOperations,
    githubToken?: string | null,
  ) {
    this.githubToken = githubToken?.trim() || null;
    this.runner = runner ?? ((args, options) => runGh(args, options, this.githubToken));
    this.conflictGit = conflictGit ?? createConflictGitOperations(this.githubToken);
  }

  repositoryTarget(remoteUrl: string | null): string {
    const remote = parseGitRemote(remoteUrl);
    if (!remote || remote.provider !== "github" || !remote.owner) {
      throw new Error("This repository does not have a valid GitHub URL configured.");
    }
    const slug = `${remote.owner}/${remote.repo}`;
    return remote.host === "github.com" ? slug : `${remote.host}/${slug}`;
  }

  async list(
    remoteUrl: string | null,
    listState: PullRequestListState,
    limit: number,
  ): Promise<PullRequestSummary[]> {
    const repo = this.repositoryTarget(remoteUrl);
    const result = await this.runner([
      "pr", "list", "--repo", repo, "--state", listState, "--limit", String(limit),
      "--json", LIST_FIELDS,
    ]);
    const parsed = JSON.parse(result.stdout || "[]") as unknown[];
    return parsed.map(summary);
  }

  async get(remoteUrl: string | null, number: number): Promise<PullRequestDetail> {
    const repo = this.repositoryTarget(remoteUrl);
    const result = await this.runner([
      "pr", "view", String(number), "--repo", repo, "--json", DETAIL_FIELDS,
    ]);
    const parsed = asRecord(JSON.parse(result.stdout || "{}"));
    return {
      ...summary(parsed),
      body: asString(parsed.body),
      mergeable: asString(parsed.mergeable),
      maintainerCanModify: Boolean(parsed.maintainerCanModify),
      comments: comments(parsed.comments),
      reviews: reviews(parsed.reviews),
      commits: commits(parsed.commits),
      files: files(parsed.files),
    };
  }

  async diff(remoteUrl: string | null, number: number): Promise<PullRequestDiff> {
    const repo = this.repositoryTarget(remoteUrl);
    try {
      const result = await this.runner(
        ["pr", "diff", String(number), "--repo", repo, "--patch"],
        { maxOutputBytes: MAX_DIFF_OUTPUT_BYTES },
      );
      return { patch: result.stdout, truncated: false };
    } catch (error) {
      if (error instanceof Error && error.message.includes("too large")) {
        return { patch: "", truncated: true };
      }
      throw error;
    }
  }

  async comment(remoteUrl: string | null, number: number, body: string): Promise<void> {
    const repo = this.repositoryTarget(remoteUrl);
    await this.runner(
      ["pr", "comment", String(number), "--repo", repo, "--body-file", "-"],
      { input: body },
    );
  }

  async review(
    remoteUrl: string | null,
    number: number,
    event: PullRequestReviewEvent,
    body: string,
  ): Promise<void> {
    const repo = this.repositoryTarget(remoteUrl);
    const flag = event === "approve"
      ? "--approve"
      : event === "request_changes"
        ? "--request-changes"
        : "--comment";
    const args = ["pr", "review", String(number), "--repo", repo, flag];
    if (body.trim()) args.push("--body-file", "-");
    await this.runner(args, body.trim() ? { input: body } : undefined);
  }

  async merge(
    remoteUrl: string | null,
    number: number,
    method: PullRequestMergeMethod,
    deleteBranch: boolean,
  ): Promise<void> {
    const repo = this.repositoryTarget(remoteUrl);
    const args = ["pr", "merge", String(number), "--repo", repo, `--${method}`];
    if (deleteBranch) args.push("--delete-branch");
    await this.runner(args);
  }

  async setState(
    remoteUrl: string | null,
    number: number,
    nextState: "open" | "closed",
  ): Promise<void> {
    const repo = this.repositoryTarget(remoteUrl);
    await this.runner([
      "pr", nextState === "open" ? "reopen" : "close", String(number), "--repo", repo,
    ]);
  }

  async update(
    remoteUrl: string | null,
    number: number,
    input: { title?: string; body?: string },
  ): Promise<void> {
    const repo = this.repositoryTarget(remoteUrl);
    const args = ["pr", "edit", String(number), "--repo", repo];
    if (input.title !== undefined) args.push("--title", input.title);
    if (input.body !== undefined) args.push("--body-file", "-");
    await this.runner(args, input.body !== undefined ? { input: input.body } : undefined);
  }

  /**
   * Resolve merge conflicts between the PR head branch and its base branch.
   *
   * Without `resolution`, merges the base branch into the head branch in a
   * local clone and either pushes the clean merge (`status: "merged"`) or
   * returns the conflicted files with both sides (`status: "conflicts"`).
   * With `resolution` (path → side), applies the chosen side per file,
   * commits, and pushes (`status: "pushed"`).
   */
  async resolveConflicts(
    remoteUrl: string | null,
    number: number,
    resolution?: Record<string, PullRequestConflictSide>,
  ): Promise<PullRequestResolveResult> {
    const repo = this.repositoryTarget(remoteUrl);
    const remote = parseGitRemote(remoteUrl);
    const [fallbackOwner = "github", fallbackRepo = "repository"] = repo.split("/");
    const conflictCloneKey = [
      remote?.host ?? "github.com",
      remote?.owner ?? fallbackOwner,
      remote?.repo ?? fallbackRepo,
      "conflicts",
    ].join("--").replace(/[^a-zA-Z0-9._-]/g, "-");
    return withConflictOperationLock(conflictCloneKey, async () => {
      const detail = await this.get(remoteUrl, number);
      if (detail.state !== "OPEN") {
        throw new Error("Only open pull requests can have conflicts resolved.");
      }

      const clonePath = await this.conflictGit.cloneOrFetch(
        remoteUrl ?? "",
        conflictCloneKey,
        detail.baseBranch,
      );
      const baseRef = `refs/remotes/origin/${detail.baseBranch}`;

      await this.conflictGit.git(
        clonePath,
        ["checkout", "--detach", baseRef],
        30_000,
      ).catch(() => {});
      await this.conflictGit.git(
        clonePath,
        ["reset", "--hard", baseRef],
        30_000,
      ).catch(() => {});
      await this.conflictGit.git(
        clonePath,
        ["branch", "-D", "--", detail.headBranch],
        30_000,
      ).catch(() => {});

      await this.conflictGit.gh(clonePath, ["pr", "checkout", String(number)], 60_000);

      // Merge the base branch into the head branch.
    let mergeFailed = false;
    let mergeError: unknown = null;
    try {
        await this.conflictGit.git(clonePath, ["merge", "--no-edit", baseRef], 60_000);
    } catch (error) {
      mergeFailed = true;
      mergeError = error;
    }

    const conflictedPaths = await this.conflictedPaths(clonePath);

    if (mergeFailed && conflictedPaths.length === 0) {
      // The merge failed without leaving conflicts — surface the real error
      // unless we are still mid-merge with everything auto-resolved.
      const midMerge = await this.conflictGit.git(
        clonePath,
        ["rev-parse", "-q", "--verify", "MERGE_HEAD"],
        10_000,
      ).then(() => true).catch(() => false);
      if (!midMerge) {
        const reason = mergeError instanceof Error ? mergeError.message : String(mergeError);
        throw new Error(
          `Could not merge ${detail.baseBranch} into ${detail.headBranch}: ${reason}`,
        );
      }
    }

    if (conflictedPaths.length === 0) {
      // Clean merge — commit and push so the PR becomes mergeable.
      await this.conflictGit.git(
        clonePath,
        [
          "commit",
          "--no-edit",
          "-m",
          `Merge branch '${detail.baseBranch}' into ${detail.headBranch}`,
        ],
        30_000,
      ).catch(() => {});
      await this.pushHeadBranch(clonePath, repo, number, detail);
      return {
        status: "merged",
        message: `Merged ${detail.baseBranch} into ${detail.headBranch} and pushed. The pull request is now mergeable.`,
      };
    }

    if (!resolution) {
      const files: PullRequestConflictFile[] = [];
      for (const path of conflictedPaths) {
        const oursContent = await this.readStage(clonePath, 2, path);
        const theirsContent = await this.readStage(clonePath, 3, path);
        const ours = oursContent === null ? "" : decodeConflictText(oursContent);
        const theirs = theirsContent === null ? "" : decodeConflictText(theirsContent);
        const binary = ours === null || theirs === null;
        files.push({
          path,
          binary,
          ours: binary ? "" : (ours ?? ""),
          theirs: binary ? "" : (theirs ?? ""),
        });
      }
      return { status: "conflicts", files };
    }

    const conflictPathSet = new Set(conflictedPaths);
    for (const suppliedPath of Object.keys(resolution)) {
      assertSafeConflictPath(suppliedPath);
      if (!conflictPathSet.has(suppliedPath)) {
        throw new Error("Conflict resolution includes a file that is not conflicted.");
      }
    }

    for (const path of conflictedPaths) {
      const side = Object.prototype.hasOwnProperty.call(resolution, path)
        ? resolution[path]
        : undefined;
      if (side !== "ours" && side !== "theirs") {
        throw new Error(`A conflict resolution is required for ${path}.`);
      }
      const stage = side === "ours" ? 2 : 3;
      if (await this.stageExists(clonePath, stage, path)) {
        await this.conflictGit.git(
          clonePath,
          ["checkout", side === "ours" ? "--ours" : "--theirs", "--", path],
          30_000,
        );
        await this.conflictGit.git(clonePath, ["add", "--", path], 30_000);
      } else {
        await this.conflictGit.git(
          clonePath,
          ["rm", "-f", "--ignore-unmatch", "--", path],
          30_000,
        );
        await this.conflictGit.git(clonePath, ["add", "-A", "--", path], 30_000);
      }
    }

    await this.conflictGit.git(
      clonePath,
      ["commit", "--no-edit", "-m", `Resolve merge conflicts with ${detail.baseBranch}`],
      30_000,
    );
    await this.pushHeadBranch(clonePath, repo, number, detail);
    return { status: "pushed", message: "Conflicts resolved and pushed." };
    });
  }

  private async conflictedPaths(cwd: string): Promise<string[]> {
    const output = await this.conflictGit.git(cwd, ["ls-files", "-u", "-z"], 30_000);
    const paths = output
      .split("\0")
      .filter(Boolean)
      .map((record) => {
        const separator = record.indexOf("\t");
        return separator >= 0 ? record.slice(separator + 1) : "";
      })
      .filter(Boolean);
    for (const path of paths) assertSafeConflictPath(path);
    return [...new Set(paths)];
  }

  private async readStage(cwd: string, stage: number, path: string): Promise<Buffer | null> {
    try {
      return await this.conflictGit.gitBuffer(cwd, ["show", `:${stage}:${path}`], 30_000);
    } catch {
      return null;
    }
  }

  private async stageExists(cwd: string, stage: number, path: string): Promise<boolean> {
    return this.conflictGit.git(cwd, ["cat-file", "-e", `:${stage}:${path}`], 10_000)
      .then(() => true)
      .catch(() => false);
  }

  private async pushHeadBranch(
    cwd: string,
    repo: string,
    number: number,
    detail: PullRequestDetail,
  ): Promise<void> {
    const token = this.githubToken ?? await this.runner(["auth", "token"])
      .then((result) => result.stdout.trim())
      .catch(() => "");
    if (!token) {
      throw new Error("GitHub authentication is required. Sign in to GitHub for this account.");
    }

    const view = await this.runner([
      "pr", "view", String(number), "--repo", repo, "--json", "headRepository",
    ]);
    const rawHeadUrl = asString(asRecord(asRecord(JSON.parse(view.stdout)).headRepository).url);
    const headUrl = sanitizeHttpsRemote(rawHeadUrl);
    if (!headUrl) {
      throw new Error("Could not determine the pull request branch repository.");
    }

    try {
      await this.conflictGit.git(
        cwd,
        ["push", headUrl, `HEAD:refs/heads/${detail.headBranch}`],
        60_000,
        githubGitAuthOptions(token),
      );
    } catch {
      throw new Error("Could not push the resolved conflicts to the pull request branch.");
    }
  }
}
