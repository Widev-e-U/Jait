import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { openDatabase, migrateDatabase } from "./db/index.js";
import { ThreadService } from "./services/threads.js";
import { ThreadReviewSyncService } from "./services/thread-review-sync.js";
import type { GitForge } from "./services/git-forge.js";
import type { ParsedRemote } from "./services/git.js";

describe("ThreadReviewSyncService", () => {
  it("updates a thread to merged from forge state and clears the session", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const cwd = await mkdtemp(join(tmpdir(), "jait-thread-review-sync-"));
    const threadService = new ThreadService(db);
    const thread = threadService.create({
      userId: "review-sync-user",
      title: "Thread",
      providerId: "codex",
      workingDirectory: cwd,
      branch: "feature/test-branch",
      kind: "delivery",
    });
    threadService.update(thread.id, {
      prState: "open",
      prUrl: "https://github.com/acme/repo/pull/42",
      prNumber: 42,
      prTitle: "Existing PR",
      providerSessionId: "provider-session-1",
    });

    const mockForge: Pick<GitForge, "findExistingPr"> = {
      findExistingPr: vi.fn(async (_execCwd: string, _remote: ParsedRemote, _headBranch: string) => ({
        status: "opened_existing",
        url: "https://github.com/acme/repo/pull/42",
        number: 42,
        title: "Existing PR",
        baseBranch: "main",
        headBranch: "feature/test-branch",
        state: "merged",
      })),
    };
    const broadcastAll = vi.fn();

    const service = new ThreadReviewSyncService({
      threadService,
      gitService: {
        getPreferredRemote: vi.fn(async () => "origin"),
        getRemoteUrl: vi.fn(async () => "https://github.com/acme/repo.git"),
      },
      resolveForge: () => mockForge as GitForge,
      ws: {
        broadcastAll,
        getFsNodes: () => [],
      } as never,
      log: { error: vi.fn() },
    });

    try {
      await service.tick();

      const updated = threadService.getById(thread.id);
      expect(updated?.prState).toBe("merged");
      expect(updated?.prBaseBranch).toBe("main");
      expect(updated?.providerSessionId).toBeNull();
      expect(updated?.workingDirectory).toBeNull();
      expect(updated?.branch).toBeNull();

      const activities = threadService.getActivities(thread.id, 10);
      expect(activities.some((activity) => activity.summary.includes("Pull request merged"))).toBe(true);
      expect(broadcastAll).toHaveBeenCalled();
    } finally {
      await rm(cwd, { recursive: true, force: true });
      sqlite.close();
    }
  });
});
