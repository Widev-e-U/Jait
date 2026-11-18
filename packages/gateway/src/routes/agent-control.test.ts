/**
 * Route contract for the user-facing agent kill switch.
 *
 * The halt has to be reachable, inspectable and reversible over HTTP even
 * while work is frozen, and a halted owner must be refused by the dispatch
 * routes that would otherwise start more autonomous work.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { personaAgentProfileSchema } from "@jait/shared";
import { createThreadControlTool } from "../tools/thread-tools.js";
import type { CliProviderAdapter, ProviderInfo, ProviderSession, StartSessionOptions } from "../providers/contracts.js";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { ProviderRegistry } from "../providers/registry.js";
import { SessionService } from "../services/sessions.js";
import { SessionStateService } from "../services/session-state.js";
import { ThreadService } from "../services/threads.js";
import { UserService } from "../services/users.js";
import { signAuthToken } from "../security/http-auth.js";

class MockProvider implements CliProviderAdapter {
  readonly id = "codex";
  readonly info: ProviderInfo = { id: "codex", name: "Mock Codex", description: "Test provider", available: true, modes: ["full-access", "supervised"] };
  checkAvailability = vi.fn(async (): Promise<boolean> => true);
  startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "provider-" + options.threadId, providerId: this.id, threadId: options.threadId, status: "ready",
  } as ProviderSession));
  sendTurn = vi.fn(async (): Promise<void> => {});
  stopSession = vi.fn(async (_sessionId: string): Promise<void> => {});
  onEvent() { return () => {}; }
  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async listModels(): Promise<{ id: string; name: string }[]> { return [{ id: "mock-model", name: "Mock Model" }]; }
}

describe("agent control routes", () => {
  let opened: Awaited<ReturnType<typeof openDatabase>>;
  let app: Awaited<ReturnType<typeof createServer>> | null = null;
  let headers: { authorization: string };
  let sessionService: SessionService;
  let threadService: ThreadService;
  let providerRegistry: ProviderRegistry;
  let provider: MockProvider;
  let userId: string;

  beforeEach(async () => {
    opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test" as const,
      llmProvider: "ollama" as const,
      ollamaUrl: "http://127.0.0.1:1",
      jwtSecret: "agent-control-test-secret",
    };
    sessionService = new SessionService(opened.db);
    const sessionState = new SessionStateService(opened.db);
    const userService = new UserService(opened.db);
    threadService = new ThreadService(opened.db);
    providerRegistry = new ProviderRegistry();
    provider = new MockProvider();
    providerRegistry.register(provider);
    const user = userService.createUser("kill-switch-user", "password123");
    userId = user.id;
    app = await createServer(config, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      sessionState,
      userService,
      threadService,
      providerRegistry,
    });
    headers = { authorization: "Bearer " + await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret) };
  });

  afterEach(async () => {
    await app?.close();
    app = null;
    opened.sqlite.close();
  });

  it("requires authentication for every control action", async () => {
    expect((await app!.inject({ method: "GET", url: "/api/agent-control" })).statusCode).toBe(401);
    expect((await app!.inject({ method: "POST", url: "/api/agent-control/halt" })).statusCode).toBe(401);
    expect((await app!.inject({ method: "POST", url: "/api/agent-control/resume" })).statusCode).toBe(401);
  });

  it("halts, stays readable and resumable while halted, and refuses new autonomous work", async () => {
    const halted = await app!.inject({ method: "POST", url: "/api/agent-control/halt", headers, payload: { reason: "runaway cost" } });
    expect(halted.statusCode).toBe(200);
    expect(halted.json()).toMatchObject({ state: { halted: true, reason: "runaway cost" }, stopError: null });
    expect(typeof halted.json().stopped).toBe("number");

    // The emergency stop must remain observable while frozen.
    const read = await app!.inject({ method: "GET", url: "/api/agent-control", headers });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({ state: { halted: true, reason: "runaway cost" } });

    // Dispatch routes refuse, and the refusal says why.
    const blocked = await app!.inject({ method: "POST", url: "/api/threads", headers, payload: { title: "Should not start" } });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ code: "agent_halted", action: "create-thread" });

    const resumed = await app!.inject({ method: "POST", url: "/api/agent-control/resume", headers });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json()).toMatchObject({ state: { halted: false } });

    // Resume is the only path that clears the halt; work is no longer refused.
    const afterResume = await app!.inject({ method: "POST", url: "/api/threads", headers, payload: { title: "Now allowed", providerId: "codex" } });
    expect(afterResume.statusCode).not.toBe(409);
  });

  it.each(["availability", "startup"] as const)("does not launch a turn when halted during provider %s", async (phase) => {
    const thread = threadService.create({ userId, title: "Delayed startup", providerId: "codex", workingDirectory: process.cwd() });
    let entered!: () => void;
    let release!: () => void;
    const enteredPromise = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    if (phase === "availability") {
      provider.checkAvailability.mockImplementationOnce(async () => { entered(); await gate; return true; });
    } else {
      provider.startSession.mockImplementationOnce(async options => {
        entered(); await gate;
        return { id: "delayed-session", providerId: provider.id, threadId: options.threadId, status: "ready" } as ProviderSession;
      });
    }
    const starting = app!.inject({ method: "POST", url: "/api/threads/" + thread.id + "/start", headers, payload: { message: "Must stay stopped" } });
    await enteredPromise;
    const halt = await app!.inject({ method: "POST", url: "/api/agent-control/halt", headers });
    expect(halt.json().state.halted).toBe(true);
    release();
    const response = await starting;
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("agent_halted");
    expect(provider.sendTurn).not.toHaveBeenCalled();
    if (phase === "startup") expect(provider.stopSession).toHaveBeenCalledWith("delayed-session");
    else expect(provider.startSession).not.toHaveBeenCalled();
    expect(threadService.getById(thread.id)?.status).not.toBe("running");
  });

  it("reports a failed stop while still stopping the other threads", async () => {
    const first = threadService.create({ userId, title: "Refuses stop", providerId: "codex" });
    const second = threadService.create({ userId, title: "Stops normally", providerId: "codex" });
    threadService.markRunning(first.id, "refuses-stop");
    threadService.markRunning(second.id, "stops-normally");
    provider.stopSession.mockImplementation(async sessionId => {
      if (sessionId === "refuses-stop") throw new Error("Node disconnected");
    });
    const halt = await app!.inject({ method: "POST", url: "/api/agent-control/halt", headers });
    expect(halt.json()).toMatchObject({ stopped: 1, state: { halted: true } });
    expect(halt.json().stopError).toContain(first.id);
    expect(halt.json().stopError).toContain("Node disconnected");
    expect(threadService.getById(second.id)?.status).toBe("interrupted");
    expect(threadService.getById(first.id)?.status).toBe("running");
  });

  it("refuses scheduler and MCP thread control while halted without creating work", async () => {
    await app!.inject({ method: "POST", url: "/api/agent-control/halt", headers });
    const tool = createThreadControlTool({ threadService, providerRegistry });
    const result = await tool.execute({ action: "create", prompt: "Scheduled task", providerId: "codex", detach: true }, {
      userId, sessionId: "schedule-context", requestedBy: "scheduler", actionId: "halted-schedule", projectRoot: process.cwd(),
    });
    expect(result).toMatchObject({ ok: false, data: { code: "agent_halted" } });
    expect(threadService.list(userId)).toHaveLength(0);
    expect(provider.startSession).not.toHaveBeenCalled();
    expect((await tool.execute({ action: "list" }, { userId, sessionId: "schedule-context", requestedBy: "mcp-client", actionId: "halted-read", projectRoot: process.cwd() })).ok).toBe(true);
  });

  it("refuses saved-agent chat turns while halted", async () => {
    const session = sessionService.create({ userId });
    const profile = personaAgentProfileSchema.parse({ id: "halted-chat-agent", name: "Helper", avatar: "Nova", providerId: "codex", persona: "Help the owner", chatSessionId: session.id,
      repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
      schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [] });
    threadService.savePersonaAgent(userId, profile);
    await app!.inject({ method: "POST", url: "/api/agent-control/halt", headers });
    const response = await app!.inject({ method: "POST", url: "/api/chat", headers, payload: { sessionId: session.id, content: "Continue", personaAgentId: profile.id } });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("agent_halted");
    expect(provider.sendTurn).not.toHaveBeenCalled();
  });

  it("stops an in-flight saved-agent chat when the owner halts", async () => {
    const session = sessionService.create({ userId });
    const profile = personaAgentProfileSchema.parse({ id: "running-chat-agent", name: "Helper", avatar: "Nova", providerId: "codex", persona: "Help the owner", chatSessionId: session.id,
      repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
      schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [] });
    threadService.savePersonaAgent(userId, profile);
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    provider.sendTurn.mockImplementationOnce(async () => { entered(); await gate; });
    const turn = app!.inject({ method: "POST", url: "/api/chat", headers, payload: { sessionId: session.id, content: "Work", personaAgentId: profile.id } });
    await started;
    const response = await app!.inject({ method: "POST", url: "/api/agent-control/halt", headers });
    release();
    await turn;
    expect(response.json()).toMatchObject({ stopped: 1, stopError: null, state: { halted: true } });
    expect(provider.stopSession).toHaveBeenCalled();
  });

  it("rejects a malformed halt request without changing the halt state", async () => {
    const bad = await app!.inject({
      method: "POST",
      url: "/api/agent-control/halt",
      headers,
      payload: { reason: "x".repeat(501) },
    });
    expect(bad.statusCode).toBe(400);
    const read = await app!.inject({ method: "GET", url: "/api/agent-control", headers });
    expect(read.json()).toMatchObject({ state: { halted: false } });
  });
});
