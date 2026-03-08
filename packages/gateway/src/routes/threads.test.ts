import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { ProviderRegistry } from "../providers/registry.js";
import { signAuthToken } from "../security/http-auth.js";
import type { GitStepResult } from "../services/git.js";
import { ThreadService } from "../services/threads.js";
import { registerThreadRoutes } from "./threads.js";

async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}

describe("thread routes", () => {
  it("rejects create-pr while a thread is not completed", async () => {
    const { db, sqlite } = openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const runStackedAction = vi.fn(async (): Promise<GitStepResult> => ({
      commit: { status: "skipped_no_changes" },
      push: { status: "skipped_not_requested" },
      branch: { status: "skipped_not_requested" },
      pr: { status: "skipped_not_requested" },
    }));

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry: new ProviderRegistry(),
      gitService: { runStackedAction },
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "Implement feature",
      providerId: "codex",
      workingDirectory: process.cwd(),
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/create-pr`,
      headers,
      payload: { commitMessage: "feat: implement feature", baseBranch: "main" },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({
      error: "Thread must be completed before creating a pull request.",
    });
    expect(runStackedAction).not.toHaveBeenCalled();

    await app.close();
    sqlite.close();
  });

  it("creates a PR for a completed thread and updates thread metadata", async () => {
    const { db, sqlite } = openDatabase(":memory:");
    migrateDatabase(sqlite);

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const threadService = new ThreadService(db);
    const prUrl = "https://github.com/acme/repo/pull/42";
    const runStackedAction = vi.fn(async (): Promise<GitStepResult> => ({
      commit: { status: "created", commitSha: "abc123", subject: "feat: implement feature" },
      push: { status: "pushed", branch: "feature/awesome" },
      branch: { status: "skipped_not_requested" },
      pr: {
        status: "created",
        url: prUrl,
        number: 42,
        baseBranch: "main",
        headBranch: "feature/awesome",
        title: "feat: implement feature",
      },
    }));

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry: new ProviderRegistry(),
      gitService: { runStackedAction },
    });

    const headers = await authHeader(config.jwtSecret, "user-1");
    const thread = threadService.create({
      userId: "user-1",
      title: "Implement feature",
      providerId: "codex",
      workingDirectory: process.cwd(),
    });
    threadService.markCompleted(thread.id);

    const response = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/create-pr`,
      headers,
      payload: { commitMessage: "feat: implement feature", baseBranch: "main" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      message: `Pull request ready: ${prUrl}`,
      prUrl,
    });
    expect(runStackedAction).toHaveBeenCalledWith(
      process.cwd(),
      "commit_push_pr",
      "feat: implement feature",
      false,
      "main",
      undefined,
    );

    const updated = threadService.getById(thread.id);
    expect(updated?.prUrl).toBe(prUrl);
    expect(updated?.prNumber).toBe(42);
    expect(updated?.prTitle).toBe("feat: implement feature");
    expect(updated?.prState).toBe("open");

    await app.close();
    sqlite.close();
  });
});
