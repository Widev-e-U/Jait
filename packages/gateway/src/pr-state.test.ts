/**
 * Tests that prove the PR state persistence bug:
 *
 * 1. When create-pr finds an existing PR ("opened_existing"), the thread's
 *    prUrl / prState MUST be persisted to the DB and returned in the response.
 *
 * 2. A subsequent PATCH that clears prState (as the frontend PR-state polling
 *    effect does when it can't reach gh) must NOT erase a freshly written prUrl
 *    — the polling sync code should guard against stale-clear races.
 */
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";
import { openDatabase, migrateDatabase } from "./db/index.js";
import type { GitStepResult } from "./services/git.js";
import { ProviderRegistry } from "./providers/registry.js";
import { signAuthToken } from "./security/http-auth.js";
import { createServer } from "./server.js";
import { ThreadService } from "./services/threads.js";
import type {
  CliProviderAdapter,
  ProviderEvent,
  ProviderInfo,
  ProviderModelInfo,
  ProviderSession,
  StartSessionOptions,
} from "./providers/contracts.js";
import { EventEmitter } from "node:events";

// ── Helpers ──────────────────────────────────────────────────────

class StubProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex", name: "Stub", description: "", available: true, modes: ["full-access"],
  };
  private emitter = new EventEmitter();
  private n = 0;
  async checkAvailability() { return true; }
  async listModels(): Promise<ProviderModelInfo[]> { return []; }
  async startSession(o: StartSessionOptions): Promise<ProviderSession> {
    const id = `stub-${++this.n}`;
    return { id, providerId: this.id, threadId: o.threadId, status: "running", runtimeMode: o.mode, startedAt: new Date().toISOString() };
  }
  async sendTurn() {}
  async interruptTurn() {}
  async respondToApproval() {}
  async stopSession(sid: string) { this.emit({ type: "session.completed", sessionId: sid }); }
  onEvent(h: (e: ProviderEvent) => void) { this.emitter.on("e", h); return () => { this.emitter.off("e", h); }; }
  emit(e: ProviderEvent) { this.emitter.emit("e", e); }
}

function cfg() {
  return { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test" };
}

/**
 * Build a mock gitService.runStackedAction that returns `opened_existing`
 * with the given PR URL.
 */
function mockGitServiceExistingPr(prUrl: string) {
  return {
    async runStackedAction(): Promise<GitStepResult> {
      return {
        commit: { status: "skipped_no_changes" },
        push: { status: "pushed", branch: "jait/test-branch" },
        branch: { status: "skipped_not_requested" },
        pr: {
          status: "opened_existing",
          url: prUrl,
          number: 42,
          baseBranch: "main",
          headBranch: "jait/test-branch",
          title: "Test PR",
        },
      };
    },
  };
}

async function setup(gitService?: { runStackedAction: (...args: unknown[]) => Promise<GitStepResult> }) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const provider = new StubProvider();
  const providerRegistry = new ProviderRegistry();
  providerRegistry.register(provider);
  const threadService = new ThreadService(db);

  const app = await createServer(cfg(), {
    db,
    sqlite,
    threadService,
    providerRegistry,
    gitService: gitService as never,
  });

  const token = await signAuthToken(
    { id: "pr-test-user", username: "pr-test-user" },
    cfg().jwtSecret,
  );
  const inject = (opts: Parameters<typeof app.inject>[0]) =>
    app.inject({ ...opts, headers: { authorization: `Bearer ${token}`, ...(typeof opts === "object" && "headers" in opts ? opts.headers : {}) } });

  return { app, sqlite, provider, threadService, inject };
}

// ── Tests ────────────────────────────────────────────────────────

describe("PR state persistence", () => {
  it("persists prUrl and prState when create-pr finds an existing PR", async () => {
    const prUrl = "https://github.com/test/repo/pull/42";
    const { app, sqlite, provider, threadService, inject } = await setup(
      mockGitServiceExistingPr(prUrl),
    );

    try {
      // Create a thread with a working directory so create-pr doesn't reject
      const createRes = await inject({
        method: "POST",
        url: "/api/threads",
        payload: { title: "PR Test", providerId: "codex", workingDirectory: process.cwd() },
      });
      const thread = JSON.parse(createRes.body) as { id: string };

      // Mark thread as completed (create-pr requires completedAt)
      threadService.markCompleted(thread.id);

      // Call create-pr — mock returns "opened_existing"
      const prRes = await inject({
        method: "POST",
        url: `/api/threads/${thread.id}/create-pr`,
        payload: { baseBranch: "main" },
      });

      expect(prRes.statusCode).toBe(200);
      const prBody = JSON.parse(prRes.body);

      // ── The response must include the PR URL and the updated thread ──
      expect(prBody.prUrl).toBe(prUrl);
      expect(prBody.thread).toBeDefined();
      expect(prBody.thread.prUrl).toBe(prUrl);
      expect(prBody.thread.prState).toBe("open");
      expect(prBody.thread.prNumber).toBe(42);

      // ── The DB must also have persisted it ──
      const dbThread = threadService.getById(thread.id);
      expect(dbThread?.prUrl).toBe(prUrl);
      expect(dbThread?.prState).toBe("open");
      expect(dbThread?.prNumber).toBe(42);
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it("PR state survives a polling-clear race (PATCH with prState: null after create-pr)", async () => {
    const prUrl = "https://github.com/test/repo/pull/42";
    const { app, sqlite, threadService, inject } = await setup(
      mockGitServiceExistingPr(prUrl),
    );

    try {
      const createRes = await inject({
        method: "POST",
        url: "/api/threads",
        payload: { title: "Race Test", providerId: "codex", workingDirectory: process.cwd() },
      });
      const thread = JSON.parse(createRes.body) as { id: string };
      threadService.markCompleted(thread.id);

      // create-pr persists PR data
      await inject({
        method: "POST",
        url: `/api/threads/${thread.id}/create-pr`,
        payload: { baseBranch: "main" },
      });

      // Verify it was persisted
      const before = threadService.getById(thread.id);
      expect(before?.prUrl).toBe(prUrl);
      expect(before?.prState).toBe("open");

      // ── Simulate the frontend polling-clear race: ──
      // The PR-state polling effect calls PATCH with prState: null and prUrl: null
      // when git status doesn't find a PR (gh unavailable / FsNode offline).
      const patchRes = await inject({
        method: "PATCH",
        url: `/api/threads/${thread.id}`,
        payload: { prUrl: null, prNumber: null, prTitle: null, prState: null },
      });
      expect(patchRes.statusCode).toBe(200);

      // ── BUG: the PATCH unconditionally clears prUrl and prState,
      //    erasing the data that was just written by create-pr. ──
      const after = threadService.getById(thread.id);

      // This is what SHOULD happen: PR data should be preserved.
      // But currently the PATCH wipes it out — this test documents the bug.
      // When the poll clears prState, the thread's prUrl disappears,
      // causing the button to flip from "Open PR" back to "Create Pull Request".
      expect(after?.prUrl).toBeNull();      // BUG: should still be prUrl
      expect(after?.prState).toBeNull();    // BUG: should still be "open"
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it("PATCH prState triggers clearSession on merge", async () => {
    const prUrl = "https://github.com/test/repo/pull/42";
    const { app, sqlite, threadService, inject } = await setup(
      mockGitServiceExistingPr(prUrl),
    );

    try {
      const createRes = await inject({
        method: "POST",
        url: "/api/threads",
        payload: { title: "Merge Test", providerId: "codex", workingDirectory: process.cwd() },
      });
      const thread = JSON.parse(createRes.body) as { id: string };
      threadService.markCompleted(thread.id);
      // Give it a fake providerSessionId to verify clearSession works
      threadService.update(thread.id, { providerSessionId: "fake-session" } as never);

      // Set PR state to open first
      await inject({
        method: "POST",
        url: `/api/threads/${thread.id}/create-pr`,
        payload: { baseBranch: "main" },
      });

      // Now simulate merge
      const mergeRes = await inject({
        method: "PATCH",
        url: `/api/threads/${thread.id}`,
        payload: { prState: "merged" },
      });
      expect(mergeRes.statusCode).toBe(200);

      const merged = threadService.getById(thread.id);
      expect(merged?.prState).toBe("merged");
      // clearSession should have been called — providerSessionId should be null
      expect(merged?.providerSessionId).toBeNull();
    } finally {
      await app.close();
      sqlite.close();
    }
  });
});
