import { describe, expect, it, vi } from "vitest";
import { GitHubPullRequestService } from "./github-pull-requests.js";

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
});
