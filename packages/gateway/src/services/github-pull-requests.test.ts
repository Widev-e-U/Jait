import { describe, expect, it, vi } from "vitest";
import {
  GitHubPullRequestService,
  type PullRequestConflictGitOperations,
} from "./github-pull-requests.js";

function conflictRunner(options: {
  baseBranch?: string;
  headBranch?: string;
  token?: string;
  headUrl?: string;
} = {}) {
  return vi.fn(async (args: string[]) => {
    if (args[0] === "auth") {
      return { stdout: options.token ?? "test-token", stderr: "" };
    }
    if (args.at(-1) === "headRepository") {
      return {
        stdout: JSON.stringify({
          headRepository: { url: options.headUrl ?? "https://github.com/acme/jait" },
        }),
        stderr: "",
      };
    }
    return {
      stdout: JSON.stringify({
        number: 42,
        title: "Conflict PR",
        state: "OPEN",
        baseRefName: options.baseBranch ?? "main",
        headRefName: options.headBranch ?? "feature",
      }),
      stderr: "",
    };
  });
}

function conflictOperations(options: {
  paths?: Array<{ path: string; mode?: string }>;
  stages?: Record<string, Buffer>;
  git?: PullRequestConflictGitOperations["git"];
  cloneOrFetch?: PullRequestConflictGitOperations["cloneOrFetch"];
} = {}): PullRequestConflictGitOperations {
  const paths = options.paths ?? [];
  return {
    cloneOrFetch: options.cloneOrFetch ?? vi.fn(async () => "/tmp/jait-conflict-clone"),
    git: options.git ?? vi.fn(async (_cwd, args) => {
      if (args[0] === "merge" && paths.length > 0) throw new Error("merge conflicts");
      if (args[0] === "ls-files") {
        return paths.map(({ path, mode = "100644" }) => `${mode} deadbeef 2\t${path}\0`).join("");
      }
      return "";
    }),
    gitBuffer: vi.fn(async (_cwd, args) => options.stages?.[String(args[1])] ?? Buffer.from("text")),
    gh: vi.fn(async () => ""),
  };
}

describe("GitHubPullRequestService", () => {
  it("lists and normalizes GitHub pull requests", async () => {
    const runner = vi.fn(async () => ({
      stdout: JSON.stringify([{
        number: 42,
        title: "feat: in-app pull requests",
        state: "OPEN",
        url: "https://github.com/acme/jait/pull/42",
        author: { login: "octocat", name: "Octo Cat" },
        baseRefName: "main",
        headRefName: "feature/pulls",
        isDraft: false,
        reviewDecision: "APPROVED",
        mergeStateStatus: "CLEAN",
        additions: 120,
        deletions: 15,
        changedFiles: 4,
        createdAt: "2026-08-01T10:00:00Z",
        updatedAt: "2026-08-01T12:00:00Z",
        labels: [{ name: "feature", color: "00ff00" }],
        statusCheckRollup: [{
          name: "test",
          status: "COMPLETED",
          conclusion: "SUCCESS",
          detailsUrl: "https://github.com/acme/jait/actions/1",
        }],
      }]),
      stderr: "",
    }));
    const service = new GitHubPullRequestService(runner);

    const result = await service.list("git@github.com:acme/jait.git", "open", 50);

    expect(runner).toHaveBeenCalledWith([
      "pr", "list", "--repo", "acme/jait", "--state", "open", "--limit", "50",
      "--json", expect.stringContaining("statusCheckRollup"),
    ]);
    expect(result).toEqual([expect.objectContaining({
      number: 42,
      state: "OPEN",
      author: { login: "octocat", name: "Octo Cat" },
      checks: [{
        name: "test",
        status: "COMPLETED",
        conclusion: "SUCCESS",
        detailsUrl: "https://github.com/acme/jait/actions/1",
      }],
    })]);
  });

  it("passes review text on stdin instead of shell interpolation", async () => {
    const runner = vi.fn(async () => ({ stdout: "", stderr: "" }));
    const service = new GitHubPullRequestService(runner);
    const body = "Looks good with `code` and $(untrusted input).";

    await service.review("https://github.com/acme/jait", 42, "approve", body);

    expect(runner).toHaveBeenCalledWith(
      ["pr", "review", "42", "--repo", "acme/jait", "--approve", "--body-file", "-"],
      { input: body },
    );
  });

  it("rejects repositories without a configured GitHub remote", () => {
    const service = new GitHubPullRequestService();

    expect(() => service.repositoryTarget("https://gitlab.com/acme/jait"))
      .toThrow("valid GitHub URL");
  });

  it("fails closed instead of inheriting an ambient gateway token", async () => {
    const previousToken = process.env.GITHUB_TOKEN;
    process.env.GITHUB_TOKEN = "gateway-owner-token";
    try {
      const service = new GitHubPullRequestService();
      await expect(service.list("https://github.com/acme/jait", "open", 1))
        .rejects.toThrow("GitHub authentication is required");
    } finally {
      if (previousToken === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = previousToken;
    }
  });

  it("keeps malicious branches and conflict paths inside argv boundaries", async () => {
    const path = "src/link;$(touch-owned)";
    const baseBranch = "main;$(touch-base)";
    const headBranch = "feature;$(touch-head)";
    const operations = conflictOperations({ paths: [{ path, mode: "120000" }] });
    const service = new GitHubPullRequestService(
      conflictRunner({ baseBranch, headBranch }),
      operations,
    );

    await service.resolveConflicts(
      "https://github.com/acme/jait",
      42,
      { [path]: "ours" },
    );

    expect(operations.cloneOrFetch).toHaveBeenCalledWith(
      "https://github.com/acme/jait",
      "github.com--acme--jait--conflicts",
      baseBranch,
    );
    expect(operations.git).toHaveBeenCalledWith(
      "/tmp/jait-conflict-clone",
      ["merge", "--no-edit", `refs/remotes/origin/${baseBranch}`],
      60_000,
    );
    expect(operations.git).toHaveBeenCalledWith(
      "/tmp/jait-conflict-clone",
      ["checkout", "--ours", "--", path],
      30_000,
    );
    expect(operations.git).toHaveBeenCalledWith(
      "/tmp/jait-conflict-clone",
      ["add", "--", path],
      30_000,
    );
    expect(operations.git).toHaveBeenCalledWith(
      "/tmp/jait-conflict-clone",
      ["branch", "-D", "--", headBranch],
      30_000,
    );
  });

  it("rejects conflict path traversal before applying a resolution", async () => {
    const operations = conflictOperations({ paths: [{ path: "../outside" }] });
    const service = new GitHubPullRequestService(conflictRunner(), operations);

    await expect(service.resolveConflicts("https://github.com/acme/jait", 42))
      .rejects.toThrow("unsafe conflict path");
    expect(operations.git).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(["checkout", expect.any(String), "--", "../outside"]),
      expect.any(Number),
    );
  });

  it("preserves binary conflict stages and resolves through the Git index", async () => {
    const path = "assets/logo.bin";
    const operations = conflictOperations({
      paths: [{ path }],
      stages: {
        [`:2:${path}`]: Buffer.from([0, 255, 1, 2]),
        [`:3:${path}`]: Buffer.from([0, 254, 3, 4]),
      },
    });
    const service = new GitHubPullRequestService(conflictRunner(), operations);

    const preview = await service.resolveConflicts("https://github.com/acme/jait", 42);
    expect(preview).toEqual({
      status: "conflicts",
      files: [{ path, binary: true, ours: "", theirs: "" }],
    });

    await service.resolveConflicts(
      "https://github.com/acme/jait",
      42,
      { [path]: "theirs" },
    );
    expect(operations.git).toHaveBeenCalledWith(
      "/tmp/jait-conflict-clone",
      ["checkout", "--theirs", "--", path],
      30_000,
    );
  });

  it("keeps fallback credentials out of push argv and surfaced errors", async () => {
    const token = "ghp_super_secret";
    const git: PullRequestConflictGitOperations["git"] = vi.fn(async (_cwd, args) => {
      if (args[0] === "ls-files") return "";
      if (args[0] === "push" && args.length === 1) throw new Error("no credential helper");
      if (args[0] === "push") throw new Error(`remote echoed ${token}`);
      return "";
    });
    const operations = conflictOperations({ git });
    const service = new GitHubPullRequestService(
      conflictRunner({
        token,
        headUrl: "https://embedded:credential@github.com/fork/jait",
      }),
      operations,
    );

    let surfaced = "";
    try {
      await service.resolveConflicts("https://github.com/acme/jait", 42);
    } catch (error) {
      surfaced = error instanceof Error ? error.message : String(error);
    }
    expect(surfaced).toBe("Could not push the resolved conflicts to the pull request branch.");
    expect(surfaced).not.toContain(token);

    const fallbackPush = vi.mocked(git).mock.calls.find(([, args]) => args[0] === "push" && args.length > 1);
    expect(fallbackPush?.[1]).toEqual([
      "push",
      "https://github.com/fork/jait",
      "HEAD:refs/heads/feature",
    ]);
    expect(JSON.stringify(fallbackPush?.[1])).not.toContain(token);
    expect(fallbackPush?.[3]?.redactions).toContain(token);
  });

  it("serializes complete conflict operations for the same clone", async () => {
    let activeClones = 0;
    let maxActiveClones = 0;
    const operations = conflictOperations({
      cloneOrFetch: vi.fn(async () => {
        activeClones += 1;
        maxActiveClones = Math.max(maxActiveClones, activeClones);
        await new Promise((resolve) => setTimeout(resolve, 10));
        activeClones -= 1;
        return "/tmp/jait-conflict-clone";
      }),
    });
    const service = new GitHubPullRequestService(conflictRunner(), operations);

    await Promise.all([
      service.resolveConflicts("https://github.com/acme/jait", 41),
      service.resolveConflicts("https://github.com/acme/jait", 42),
    ]);

    expect(maxActiveClones).toBe(1);
  });
});
