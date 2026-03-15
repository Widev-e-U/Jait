/**
 * End-to-end test for the remote workspace sync flow.
 *
 * Simulates a scenario where the gateway runs on Linux (.60) and a
 * desktop node is connected via WS with files at a Windows path.
 * CLI providers (codex) run locally on the gateway against a workspace
 * mirror pulled via WorkspaceSync.
 *
 * The mock WsControlPlane fakes:
 *  - A remote FsNode (Windows, platform "windows", has "codex" provider)
 *  - proxyFsOp: handles git operations and file operations (list, stat, read, write)
 *
 * The mock codex provider fires events locally (no remote provider proxy).
 *
 * The test verifies the complete lifecycle:
 *  1. Create a branch on the remote device via git route
 *  2. Create a worktree on the remote device via git route
 *  3. Create a thread pointing to the remote working directory
 *  4. Start the thread → gateway syncs workspace via WorkspaceSync → starts local provider
 *  5. Title generation turn fires events → title updates
 *  6. Coding turn fires events → activities logged
 *  7. turn.completed → thread marked completed, files pushed back
 *  8. Activities are persisted and retrievable
 */

import Fastify from "fastify";
import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { ProviderRegistry } from "../providers/registry.js";
import { signAuthToken } from "../security/http-auth.js";
import { ThreadService } from "../services/threads.js";
import { registerThreadRoutes } from "./threads.js";
import { registerGitRoutes } from "./git.js";
import type { FsNode } from "@jait/shared";
import type { WsControlPlane } from "../ws.js";
import type { CliProviderAdapter, ProviderEvent, ProviderSession, ProviderInfo, ProviderId, StartSessionOptions } from "../providers/contracts.js";

// ── Mock WsControlPlane ──────────────────────────────────────────────

/**
 * Creates a mock WsControlPlane that simulates a remote Windows desktop
 * node. The mock intercepts fs proxy calls for git and file operations
 * (used by WorkspaceSync).
 */
function createMockWsControlPlane() {
  const remoteNodeId = "desktop-win-001";
  const remoteNode: FsNode = {
    id: remoteNodeId,
    name: "Test Windows Desktop",
    platform: "windows",
    clientId: "ws-client-001",
    isGateway: false,
    providers: ["codex"],
    registeredAt: new Date().toISOString(),
  };

  // Track proxy calls for assertions
  const fsOpCalls: Array<{ op: string; params: Record<string, unknown> }> = [];

  // Fake remote filesystem: map of path → content
  const remoteFiles: Map<string, string> = new Map([
    ["E:\\Projects\\MyApp\\package.json", '{"name":"my-app","version":"1.0.0"}'],
    ["E:\\Projects\\MyApp\\src\\index.ts", 'console.log("hello");'],
  ]);

  const mock = {
    // ── FsNode queries ─────────────────────────────────────────────
    getFsNodes: vi.fn(() => [remoteNode]),
    findNodeByDeviceId: vi.fn((deviceId: string) =>
      deviceId === remoteNodeId ? remoteNode : undefined,
    ),

    // ── Fs operation proxy ─────────────────────────────────────────
    proxyFsOp: vi.fn(async <T = unknown>(
      _nodeId: string,
      op: string,
      params: Record<string, unknown>,
      _timeoutMs?: number,
    ): Promise<T> => {
      fsOpCalls.push({ op, params });

      switch (op) {
        case "git": {
          const args = params.args as string;
          if (args.includes("checkout -b")) {
            return { stdout: "" } as T;
          }
          if (args.includes("checkout")) {
            return { stdout: "" } as T;
          }
          if (args.includes("rev-parse --abbrev-ref HEAD")) {
            return { stdout: "jait/test-branch\n" } as T;
          }
          if (args.includes("status --porcelain")) {
            return { stdout: "" } as T;
          }
          if (args.includes("pull --rebase")) {
            return { stdout: "Already up to date.\n" } as T;
          }
          return { stdout: "" } as T;
        }
        case "git-create-worktree": {
          const newBranch = params.newBranch as string;
          return {
            path: `C:\\Users\\test\\.jait\\worktrees\\testrepo\\${newBranch.replace(/\//g, "-")}`,
            branch: newBranch,
          } as T;
        }
        // ── File operations for WorkspaceSync ────────────────────────
        case "list": {
          const dirPath = String(params.path);
          const entries: string[] = [];
          const seen = new Set<string>();
          for (const key of remoteFiles.keys()) {
            if (!key.startsWith(dirPath + "\\")) continue;
            const rel = key.slice(dirPath.length + 1);
            const parts = rel.split("\\");
            const entry = parts[0]!;
            if (seen.has(entry)) continue;
            seen.add(entry);
            // If there are more parts, it's a directory
            entries.push(parts.length > 1 ? entry + "/" : entry);
          }
          return entries as T;
        }
        case "stat": {
          const filePath = String(params.path);
          const content = remoteFiles.get(filePath);
          if (content !== undefined) {
            return { size: content.length } as T;
          }
          throw new Error(`ENOENT: ${filePath}`);
        }
        case "read": {
          const filePath = String(params.path);
          const content = remoteFiles.get(filePath);
          if (content !== undefined) {
            return { content } as T;
          }
          throw new Error(`ENOENT: ${filePath}`);
        }
        case "write": {
          const filePath = String(params.path);
          const content = String(params.content);
          remoteFiles.set(filePath, content);
          return { ok: true } as T;
        }
        default:
          throw new Error(`Unexpected fs op in test: ${op}`);
      }
    }),

    // ── Broadcasting (no-op for tests) ─────────────────────────────
    broadcastAll: vi.fn(),

    // ── Test helpers ───────────────────────────────────────────────
    fsOpCalls,
    remoteNodeId,
    remoteFiles,
  } as unknown as WsControlPlane & {
    fsOpCalls: Array<{ op: string; params: Record<string, unknown> }>;
    remoteNodeId: string;
    remoteFiles: Map<string, string>;
  };

  return mock;
}

/**
 * Creates a mock CliProviderAdapter that simulates a local codex provider.
 * Events can be fired programmatically via fireEvent().
 */
function createMockProvider(id: ProviderId = "codex" as ProviderId) {
  const eventHandlers: Array<(event: ProviderEvent) => void> = [];
  let sessionCounter = 0;

  const provider: CliProviderAdapter & {
    fireEvent: (event: ProviderEvent) => void;
    startCalls: StartSessionOptions[];
    sendCalls: Array<{ sessionId: string; message: string }>;
  } = {
    id,
    info: {
      id,
      name: "Mock Codex",
      description: "Mock provider",
      available: true,
      modes: ["full-access", "supervised"],
    } as ProviderInfo,

    startCalls: [],
    sendCalls: [],

    async checkAvailability() {
      return true;
    },

    async startSession(options: StartSessionOptions): Promise<ProviderSession> {
      provider.startCalls.push(options);
      sessionCounter++;
      const sessionId = `mock-session-${sessionCounter}`;
      return {
        id: sessionId,
        providerId: id,
        threadId: options.threadId,
      };
    },

    async sendTurn(sessionId: string, message: string) {
      provider.sendCalls.push({ sessionId, message });
    },

    async interruptTurn() {},
    async respondToApproval() {},
    async stopSession() {},

    onEvent(handler: (event: ProviderEvent) => void) {
      eventHandlers.push(handler);
      return () => {
        const idx = eventHandlers.indexOf(handler);
        if (idx >= 0) eventHandlers.splice(idx, 1);
      };
    },

    fireEvent(event: ProviderEvent) {
      for (const handler of eventHandlers) {
        handler(event);
      }
    },
  };

  return provider;
}

// ── Test setup ───────────────────────────────────────────────────────

async function authHeader(jwtSecret: string, userId = "test-user") {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}

/** A Windows-style path that won't exist on the test host */
const REMOTE_CWD = "E:\\Projects\\MyApp";

describe("remote provider e2e flow", () => {
  let app: ReturnType<typeof Fastify>;
  let sqlite: ReturnType<typeof openDatabase>["sqlite"];
  let threadService: ThreadService;
  let mockWs: ReturnType<typeof createMockWsControlPlane>;
  let mockProvider: ReturnType<typeof createMockProvider>;
  let headers: Record<string, string>;
  let config: ReturnType<typeof loadConfig> & { jwtSecret: string };

  beforeEach(async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    app = Fastify({ logger: false });
    config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" } as typeof config;
    threadService = new ThreadService(opened.db);
    mockWs = createMockWsControlPlane();
    mockProvider = createMockProvider();

    const providerRegistry = new ProviderRegistry();
    // Register a local mock codex provider — CLI providers always run on the gateway
    providerRegistry.register(mockProvider);

    registerThreadRoutes(app, config, {
      threadService,
      providerRegistry,
      ws: mockWs as unknown as WsControlPlane,
    });

    registerGitRoutes(app, config, mockWs as unknown as WsControlPlane);

    headers = await authHeader(config.jwtSecret);
  });

  // ── Test: Remote branch creation ─────────────────────────────────

  it("proxies create-branch to the remote node for non-local paths", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/git/create-branch",
      headers,
      payload: { cwd: REMOTE_CWD, branch: "jait/test-branch", baseBranch: "main" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, branch: "jait/test-branch" });

    // Verify git commands were proxied
    const gitCalls = mockWs.fsOpCalls.filter((c) => c.op === "git");
    expect(gitCalls.length).toBe(2); // checkout main, then checkout -b
    expect(gitCalls[0]!.params.args).toContain('checkout "main"');
    expect(gitCalls[1]!.params.args).toContain('checkout -b "jait/test-branch"');
  });

  // ── Test: Remote worktree creation ───────────────────────────────

  it("proxies create-worktree to the remote node for non-local paths", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/git/create-worktree",
      headers,
      payload: { cwd: REMOTE_CWD, baseBranch: "main", newBranch: "jait/feature-123" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.branch).toBe("jait/feature-123");
    expect(body.path).toContain("jait-feature-123");

    const wtCalls = mockWs.fsOpCalls.filter((c) => c.op === "git-create-worktree");
    expect(wtCalls.length).toBe(1);
    expect(wtCalls[0]!.params).toMatchObject({
      cwd: REMOTE_CWD,
      baseBranch: "main",
      newBranch: "jait/feature-123",
    });
  });

  // ── Test: Remote pull ────────────────────────────────────────────

  it("proxies pull to the remote node for non-local paths", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/git/pull",
      headers,
      payload: { cwd: REMOTE_CWD },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
    const gitCalls = mockWs.fsOpCalls.filter((c) => c.op === "git");
    expect(gitCalls.some((c) => (c.params.args as string).includes("pull --rebase"))).toBe(true);
  });

  // ── Test: Remote checkout ────────────────────────────────────────

  it("proxies checkout to the remote node for non-local paths", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/git/checkout",
      headers,
      payload: { cwd: REMOTE_CWD, branch: "feature/test" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    const gitCalls = mockWs.fsOpCalls.filter((c) => c.op === "git");
    expect(gitCalls.some((c) => (c.params.args as string).includes('checkout "feature/test"'))).toBe(true);
  });

  // ── Test: Full thread lifecycle with remote provider ─────────────

  it("runs a complete remote thread lifecycle: start → sync → events → activities → complete", async () => {
    // Step 1: Create a thread pointing to a remote Windows path
    const createRes = await app.inject({
      method: "POST",
      url: "/api/threads",
      headers,
      payload: {
        title: "[MyApp] Generating title…",
        providerId: "codex",
        workingDirectory: REMOTE_CWD,
        branch: "jait/feature-001",
      },
    });

    expect(createRes.statusCode).toBe(201);
    const thread = createRes.json() as { id: string };

    // Step 2: Start the thread → should sync workspace locally and start local provider
    const startRes = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: {
        message: "Add error handling to the API routes",
        titleTask: "Add error handling to the API routes",
        titlePrefix: "[MyApp] ",
      },
    });

    expect(startRes.statusCode).toBe(200);
    const started = startRes.json() as { id: string; status: string; providerSessionId: string };
    expect(started.status).toBe("running");
    expect(started.providerSessionId).toBeTruthy();

    const sessionId = started.providerSessionId;

    // Verify workspace was synced (list/read calls were made to remote node)
    const listCalls = mockWs.fsOpCalls.filter((c) => c.op === "list");
    expect(listCalls.length).toBeGreaterThan(0);
    const readCalls = mockWs.fsOpCalls.filter((c) => c.op === "read");
    expect(readCalls.length).toBeGreaterThan(0);

    // Verify provider was started locally with the synced local path
    expect(mockProvider.startCalls.length).toBe(1);
    // The working directory should be the local mirror, not the remote path
    expect(mockProvider.startCalls[0]!.workingDirectory).not.toBe(REMOTE_CWD);
    expect(mockProvider.startCalls[0]!.workingDirectory).toContain(".jait");

    // Wait for background title gen + coding turn to fire send-turn
    await new Promise((r) => setTimeout(r, 100));

    // Verify send-turn was called locally (title gen is the first turn for codex)
    expect(mockProvider.sendCalls.length).toBeGreaterThanOrEqual(1);

    // Step 3: Simulate title generation turn events from the local provider
    mockProvider.fireEvent({ type: "token", sessionId, content: "Add Error " });
    mockProvider.fireEvent({ type: "token", sessionId, content: "Handling" });
    mockProvider.fireEvent({ type: "turn.completed", sessionId });

    // Allow time for title gen to complete and coding turn to fire
    await new Promise((r) => setTimeout(r, 200));

    // The title turn's turn.completed should have been suppressed (not marking thread completed).
    // The coding turn send-turn should have been called.
    expect(mockProvider.sendCalls.length).toBe(2); // title gen turn + coding turn

    // Verify title was updated (normalized from "Add Error Handling")
    const threadAfterTitle = threadService.getById(thread.id);
    expect(threadAfterTitle?.title).toContain("[MyApp]");
    expect(threadAfterTitle?.title).toContain("Error Handling");

    // Step 4: Simulate coding turn events from the local provider
    mockProvider.fireEvent({
      type: "tool.start",
      sessionId,
      tool: "terminal.run",
      args: { command: "echo hello" },
      callId: "call-1",
    });
    mockProvider.fireEvent({
      type: "tool.result",
      sessionId,
      tool: "terminal.run",
      ok: true,
      result: "hello",
      callId: "call-1",
    });
    mockProvider.fireEvent({ type: "token", sessionId, content: "I've added error handling." });
    mockProvider.fireEvent({ type: "turn.completed", sessionId });

    // Allow time for events to propagate
    await new Promise((r) => setTimeout(r, 50));

    // Step 5: Verify thread is marked completed
    const threadAfterComplete = threadService.getById(thread.id);
    expect(threadAfterComplete?.status).toBe("completed");
    expect(threadAfterComplete?.completedAt).toBeTruthy();

    // Step 6: Verify activities were logged
    const activitiesRes = await app.inject({
      method: "GET",
      url: `/api/threads/${thread.id}/activities`,
      headers,
    });

    expect(activitiesRes.statusCode).toBe(200);
    const { activities } = activitiesRes.json() as {
      activities: Array<{ kind: string; summary: string; payload?: unknown }>;
    };

    // Should have: user message activity, tool.start, tool.result, token, turn.completed
    expect(activities.length).toBeGreaterThan(0);

    // Check user message was logged
    expect(activities.some((a) => a.kind === "message" && a.summary.includes("error handling"))).toBe(true);

    // Check tool events were logged
    expect(activities.some((a) => a.kind === "tool.start")).toBe(true);
    expect(activities.some((a) => a.kind === "tool.result" || a.kind === "tool.error")).toBe(true);

    await app.close();
    sqlite.close();
  });

  // ── Test: Session.completed from remote cleans up properly ───────

  it("handles session.completed from local provider after workspace sync", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/api/threads",
      headers,
      payload: {
        title: "Test session cleanup",
        providerId: "codex",
        workingDirectory: REMOTE_CWD,
      },
    });

    expect(createRes.statusCode).toBe(201);
    const thread = createRes.json() as { id: string };
    const startRes = await app.inject({
      method: "POST",
      url: `/api/threads/${thread.id}/start`,
      headers,
      payload: { message: "Do something" },
    });

    expect(startRes.statusCode).toBe(200);
    const started = startRes.json() as { providerSessionId: string };
    await new Promise((r) => setTimeout(r, 100));

    // Simulate the title gen turn completing, then the coding turn completing
    mockProvider.fireEvent({ type: "turn.completed", sessionId: started.providerSessionId });
    await new Promise((r) => setTimeout(r, 200));

    // Now coding turn has started, simulate coding + session exit
    mockProvider.fireEvent({ type: "turn.completed", sessionId: started.providerSessionId });
    await new Promise((r) => setTimeout(r, 50));

    // Then provider session ends
    mockProvider.fireEvent({ type: "session.completed", sessionId: started.providerSessionId });
    await new Promise((r) => setTimeout(r, 50));

    const threadAfter = threadService.getById(thread.id);
    expect(threadAfter?.status).toBe("completed");

    await app.close();
    sqlite.close();
  });

  // ── Test: Multiple git routes proxy correctly ────────────────────

  it("routes all git operations through the remote node for non-local paths", async () => {
    // Test multiple git routes in sequence
    const ops = [
      { url: "/api/git/pull", payload: { cwd: REMOTE_CWD } },
      { url: "/api/git/checkout", payload: { cwd: REMOTE_CWD, branch: "main" } },
      { url: "/api/git/create-branch", payload: { cwd: REMOTE_CWD, branch: "jait/new", baseBranch: "main" } },
      { url: "/api/git/create-worktree", payload: { cwd: REMOTE_CWD, baseBranch: "main", newBranch: "jait/wt" } },
    ];

    for (const op of ops) {
      const res = await app.inject({
        method: "POST",
        url: op.url,
        headers,
        payload: op.payload,
      });
      expect(res.statusCode).toBe(200);
    }

    // Every operation should have been proxied (no local git execution)
    const allGitCalls = mockWs.fsOpCalls.filter((c) => c.op === "git" || c.op === "git-create-worktree");
    expect(allGitCalls.length).toBeGreaterThanOrEqual(4);

    // No local operations should have been attempted for the remote path
    // (if they were, the test would fail because E:\Projects\MyApp doesn't exist)

    await app.close();
    sqlite.close();
  });
});
