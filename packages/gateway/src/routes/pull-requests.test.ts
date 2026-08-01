import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { signAuthToken } from "../security/http-auth.js";
import { RepositoryService } from "../services/repositories.js";
import { registerPullRequestRoutes, type PullRequestOperations } from "./pull-requests.js";

async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}

function mockOperations(): PullRequestOperations {
  return {
    list: vi.fn(async () => []),
    get: vi.fn(async () => ({
      number: 42,
      title: "Test PR",
      state: "OPEN",
      url: "https://github.com/acme/repo/pull/42",
      author: { login: "octocat", name: null },
      baseBranch: "main",
      headBranch: "feature",
      isDraft: false,
      reviewDecision: "",
      mergeStateStatus: "CLEAN",
      additions: 1,
      deletions: 0,
      changedFiles: 1,
      createdAt: "2026-08-01T10:00:00Z",
      updatedAt: "2026-08-01T10:00:00Z",
      labels: [],
      checks: [],
      body: "",
      mergeable: "MERGEABLE",
      maintainerCanModify: true,
      comments: [],
      reviews: [],
      commits: [],
      files: [],
    })),
    diff: vi.fn(async () => ({ patch: "diff --git a/a b/a", truncated: false })),
    comment: vi.fn(async () => undefined),
    review: vi.fn(async () => undefined),
    merge: vi.fn(async () => undefined),
    setState: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
  };
}

describe("pull request routes", () => {
  it("lists PRs only for an owned repository", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const repoService = new RepositoryService(db);
    const pullRequestService = mockOperations();
    registerPullRequestRoutes(app, config, { repoService, pullRequestService });

    const repo = repoService.create({
      userId: "user-1",
      name: "repo",
      localPath: process.cwd(),
      githubUrl: "https://github.com/acme/repo",
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/repos/${repo.id}/pull-requests?state=all`,
      headers: await authHeader(config.jwtSecret, "user-1"),
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ pullRequests: [] });
    expect(pullRequestService.list).toHaveBeenCalledWith(
      "https://github.com/acme/repo",
      "all",
      50,
    );

    const forbidden = await app.inject({
      method: "GET",
      url: `/api/repos/${repo.id}/pull-requests`,
      headers: await authHeader(config.jwtSecret, "user-2"),
    });
    expect(forbidden.statusCode).toBe(404);
    expect(pullRequestService.list).toHaveBeenCalledTimes(1);

    await app.close();
    sqlite.close();
  });

  it("forwards comments, reviews, state changes, and merges", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const repoService = new RepositoryService(db);
    const pullRequestService = mockOperations();
    registerPullRequestRoutes(app, config, { repoService, pullRequestService });

    const repo = repoService.create({
      userId: "user-1",
      name: "repo",
      localPath: process.cwd(),
      githubUrl: "https://github.com/acme/repo",
    });
    const headers = await authHeader(config.jwtSecret, "user-1");
    const baseUrl = `/api/repos/${repo.id}/pull-requests/42`;

    const comment = await app.inject({
      method: "POST",
      url: `${baseUrl}/comments`,
      headers,
      payload: { body: "Ship it" },
    });
    const review = await app.inject({
      method: "POST",
      url: `${baseUrl}/reviews`,
      headers,
      payload: { event: "approve", body: "Looks good" },
    });
    const merge = await app.inject({
      method: "POST",
      url: `${baseUrl}/merge`,
      headers,
      payload: { method: "squash", deleteBranch: true },
    });
    const close = await app.inject({
      method: "PATCH",
      url: baseUrl,
      headers,
      payload: { state: "closed" },
    });

    expect([comment.statusCode, review.statusCode, merge.statusCode, close.statusCode])
      .toEqual([200, 200, 200, 200]);
    expect(pullRequestService.comment).toHaveBeenCalledWith(
      "https://github.com/acme/repo",
      42,
      "Ship it",
    );
    expect(pullRequestService.review).toHaveBeenCalledWith(
      "https://github.com/acme/repo",
      42,
      "approve",
      "Looks good",
    );
    expect(pullRequestService.merge).toHaveBeenCalledWith(
      "https://github.com/acme/repo",
      42,
      "squash",
      true,
    );
    expect(pullRequestService.setState).toHaveBeenCalledWith(
      "https://github.com/acme/repo",
      42,
      "closed",
    );

    await app.close();
    sqlite.close();
  });
});
