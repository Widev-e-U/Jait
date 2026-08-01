import { spawn } from "node:child_process";
import type {
  PullRequestActor,
  PullRequestCheck,
  PullRequestCommit,
  PullRequestComment,
  PullRequestDetail,
  PullRequestDiff,
  PullRequestFile,
  PullRequestLabel,
  PullRequestListState,
  PullRequestMergeMethod,
  PullRequestReview,
  PullRequestReviewEvent,
  PullRequestState,
  PullRequestSummary,
} from "@jait/shared";
import { parseGitRemote } from "./git.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_JSON_OUTPUT_BYTES = 10 * 1024 * 1024;
const MAX_DIFF_OUTPUT_BYTES = 2 * 1024 * 1024;

interface GhResult {
  stdout: string;
  stderr: string;
}

type GhRunner = (
  args: string[],
  options?: { input?: string; maxOutputBytes?: number },
) => Promise<GhResult>;

function runGh(
  args: string[],
  options?: { input?: string; maxOutputBytes?: number },
): Promise<GhResult> {
  const maxOutputBytes = options?.maxOutputBytes ?? MAX_JSON_OUTPUT_BYTES;
  return new Promise((resolve, reject) => {
    const child = spawn("gh", args, {
      env: process.env,
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
        finish(new Error(stderr.trim() || `GitHub CLI exited with code ${code ?? "unknown"}.`));
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
  constructor(private readonly runner: GhRunner = runGh) {}

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
}
