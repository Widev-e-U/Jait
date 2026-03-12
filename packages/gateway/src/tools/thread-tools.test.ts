import { describe, expect, it, vi } from "vitest";
import { openDatabase, migrateDatabase } from "../db/index.js";
import type { GitStepResult } from "../services/git.js";
import { ProviderRegistry } from "../providers/registry.js";
import { ThreadService } from "../services/threads.js";
import { SurfaceRegistry } from "../surfaces/registry.js";
import { createToolRegistry } from "./index.js";
import { createThreadControlTool } from "./thread-tools.js";

function makeContext(userId = "user-1") {
  return {
    sessionId: "s-thread-tools",
    actionId: "a-thread-tools",
    workspaceRoot: process.cwd(),
    requestedBy: "test",
    userId,
  };
}

describe("thread.control tool", () => {
  it("creates multiple threads in one call", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const tool = createThreadControlTool({
        threadService: new ThreadService(db),
        providerRegistry: new ProviderRegistry(),
        gitService: {
          runStackedAction: async (): Promise<GitStepResult> => ({
            commit: { status: "skipped_no_changes" },
            push: { status: "skipped_not_requested" },
            branch: { status: "skipped_not_requested" },
            pr: { status: "skipped_not_requested" },
          }),
        },
      });

      const result = await tool.execute(
        {
          action: "create_many",
          threads: [
            { title: "Thread A", providerId: "codex" },
            { title: "Thread B", providerId: "claude-code" },
          ],
        },
        makeContext(),
      );

      expect(result.ok).toBe(true);
      const data = result.data as { threads: Array<{ title: string }> };
      expect(data.threads).toHaveLength(2);
      expect(data.threads.map((t) => t.title)).toContain("Thread A");
      expect(data.threads.map((t) => t.title)).toContain("Thread B");
    } finally {
      sqlite.close();
    }
  });

  it("creates a PR and returns a direct link while updating thread metadata", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const threadService = new ThreadService(db);
      const thread = threadService.create({
        userId: "user-1",
        title: "Implement feature",
        providerId: "codex",
        workingDirectory: process.cwd(),
      });
      threadService.markCompleted(thread.id);

      const prUrl = "https://github.com/acme/repo/pull/42";
      const tool = createThreadControlTool({
        threadService,
        providerRegistry: new ProviderRegistry(),
        gitService: {
          runStackedAction: async (): Promise<GitStepResult> => ({
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
          }),
        },
      });

      const result = await tool.execute(
        {
          action: "create_pr",
          threadId: thread.id,
          commitMessage: "feat: implement feature",
          baseBranch: "main",
        },
        makeContext(),
      );

      expect(result.ok).toBe(true);
      expect(result.message).toContain(prUrl);
      const data = result.data as { prUrl: string | null };
      expect(data.prUrl).toBe(prUrl);

      const updated = threadService.getById(thread.id);
      expect(updated?.prUrl).toBe(prUrl);
      expect(updated?.prNumber).toBe(42);
      expect(updated?.prTitle).toBe("feat: implement feature");
      expect(updated?.prState).toBe("open");
    } finally {
      sqlite.close();
    }
  });

  it("rejects PR creation until the thread is completed", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const threadService = new ThreadService(db);
      const thread = threadService.create({
        userId: "user-1",
        title: "Implement feature",
        providerId: "codex",
        workingDirectory: process.cwd(),
      });

      const runStackedAction = vi.fn(async (): Promise<GitStepResult> => ({
        commit: { status: "created", commitSha: "abc123", subject: "feat: implement feature" },
        push: { status: "pushed", branch: "feature/awesome" },
        branch: { status: "skipped_not_requested" },
        pr: {
          status: "created",
          url: "https://github.com/acme/repo/pull/42",
          number: 42,
          baseBranch: "main",
          headBranch: "feature/awesome",
          title: "feat: implement feature",
        },
      }));

      const tool = createThreadControlTool({
        threadService,
        providerRegistry: new ProviderRegistry(),
        gitService: {
          runStackedAction,
        },
      });

      const result = await tool.execute(
        {
          action: "create_pr",
          threadId: thread.id,
          commitMessage: "feat: implement feature",
          baseBranch: "main",
        },
        makeContext(),
      );

      expect(result.ok).toBe(false);
      expect(result.message).toBe("Thread must be completed before creating a pull request.");
      expect(runStackedAction).not.toHaveBeenCalled();
    } finally {
      sqlite.close();
    }
  });

  it("is registered in the tool registry when thread deps are provided", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const tools = createToolRegistry(new SurfaceRegistry(), {
        threadService: new ThreadService(db),
        providerRegistry: new ProviderRegistry(),
      });
      expect(tools.listNames()).toContain("thread.control");
    } finally {
      sqlite.close();
    }
  });
});
