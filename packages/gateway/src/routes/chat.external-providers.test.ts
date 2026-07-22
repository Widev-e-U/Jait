import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import type { CliProviderAdapter, ProviderEvent, ProviderInfo, ProviderSession, StartSessionOptions } from "../providers/contracts.js";
import { ProviderRegistry } from "../providers/registry.js";
import { signAuthToken } from "../security/http-auth.js";
import { SessionService } from "../services/sessions.js";
import { SessionStateService } from "../services/session-state.js";
import { UserService } from "../services/users.js";
import {
  canUseGatewayProviderForProject,
  getExternalFileMutationPath,
  getProviderRequestErrorMessage,
  isNonRecoverableProviderRequestError,
  normalizeProviderSessionError,
} from "./chat.js";

describe("canUseGatewayProviderForProject", () => {
  it("does not allow gateway CLI profiles in a remote project", () => {
    expect(canUseGatewayProviderForProject("electron-windows-node")).toBe(false);
    expect(canUseGatewayProviderForProject("gateway")).toBe(true);
    expect(canUseGatewayProviderForProject(null)).toBe(true);
  });
});

describe("getExternalFileMutationPath", () => {
  it("recognizes edit-style tool names used by external providers", () => {
    expect(getExternalFileMutationPath("edit", { path: "/tmp/a.ts" })).toBe("/tmp/a.ts");
    expect(getExternalFileMutationPath("file.write", { filePath: "/tmp/b.ts" })).toBe("/tmp/b.ts");
    expect(getExternalFileMutationPath("write", { file_path: "/tmp/c.ts" })).toBe("/tmp/c.ts");
    expect(getExternalFileMutationPath("create_file", { filename: "/tmp/d.ts" })).toBe("/tmp/d.ts");
    expect(getExternalFileMutationPath("replace_string_in_file", { targetFile: "/tmp/e.ts" })).toBe("/tmp/e.ts");
    expect(getExternalFileMutationPath("edit", { relative_path: "src/f.ts" })).toBe("src/f.ts");
    expect(getExternalFileMutationPath("edit", { changes: [{ path: "src/g.ts" }] })).toBe("src/g.ts");
    expect(getExternalFileMutationPath("edit", { input: { changes: [{ file_path: "src/h.ts" }] } })).toBe("src/h.ts");
  });

  it("ignores non-mutating tools", () => {
    expect(getExternalFileMutationPath("read", { path: "/tmp/a.ts" })).toBeNull();
    expect(getExternalFileMutationPath("web", { path: "/tmp/a.ts" })).toBeNull();
    expect(getExternalFileMutationPath("execute", { command: "echo hi" })).toBeNull();
  });
});

describe("normalizeProviderSessionError", () => {
  it("keeps auth and provider limit errors stable as authentication required", () => {
    expect(normalizeProviderSessionError("Usage limit reached for this provider")).toBe("Authentication required");
    expect(normalizeProviderSessionError("Please log in before continuing")).toBe("Authentication required");
    expect(normalizeProviderSessionError("Temporary provider outage")).toBe("Temporary provider outage");
  });

  it("extracts actionable ACP details and distinguishes non-recoverable limits", () => {
    const error = Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });

    expect(getProviderRequestErrorMessage(error)).toContain("out of credits");
    expect(isNonRecoverableProviderRequestError(error)).toBe(true);
    expect(isNonRecoverableProviderRequestError(new Error("Session process exited"))).toBe(false);
  });
});

const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};

async function authHeaders() {
  const token = await signAuthToken({ id: "chat-provider-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}

class MockChatProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  readonly startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => {
    const sessionId = `mock-session-${this.startSession.mock.calls.length}`;
    this.emit({ type: "session.started", sessionId });
    return {
      id: sessionId,
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  });

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emit({ type: "token", sessionId, content: "ok" });
      this.emit({ type: "turn.completed", sessionId });
    }, 0);
  });

  readonly stopSession = vi.fn(async (): Promise<void> => {});

  private emitter = new EventEmitter();

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async interruptTurn(): Promise<void> {
    return;
  }

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  protected emitForTest(event: ProviderEvent): void {
    this.emitter.emit("event", event);
  }

  private emit(event: ProviderEvent): void {
    this.emitForTest(event);
  }
}

class MockCreditErrorChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (): Promise<void> => {
    throw Object.assign(new Error("Internal error"), {
      code: -32603,
      data: {
        message: "Your workspace is out of credits. Ask your workspace owner to refill in order to continue.",
        codexErrorInfo: "usageLimitExceeded",
      },
    });
  });
}

class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        args: {
          todoList: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "todo-call-1",
        tool: "todo",
        ok: true,
        message: "Todo list updated (0/2 done). Working on: Trace bug",
        data: {
          items: [
            { id: 1, title: "Trace bug", status: "in-progress" },
            { id: 2, title: "Patch bug", status: "not-started" },
          ],
        },
      });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}

class MockCancelledChatProvider extends MockChatProvider {
  partialEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.partialEmitted = true;
      this.emitForTest({ type: "token", sessionId, content: "Partial answer before cancellation." });
    }, 0);
  });

  override readonly interruptTurn = vi.fn(async (sessionId: string): Promise<void> => {
    this.emitForTest({ type: "session.error", sessionId, error: "Turn cancelled" });
  });
}

class MockInterleavedToolChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "Before tool.\n" });
      this.emitForTest({
        type: "tool.start",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        args: { path: "src/example.ts" },
      });
      this.emitForTest({
        type: "tool.result",
        sessionId,
        callId: "tool-call-1",
        tool: "read",
        ok: true,
        message: "Read src/example.ts",
        data: { output: "example" },
      });
      this.emitForTest({ type: "token", sessionId, content: "\nAfter tool." });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
  });
}

class MockApprovalChatProvider extends MockChatProvider {
  approvalEmitted = false;

  override readonly sendTurn = vi.fn(async (sessionId: string, _content?: string): Promise<void> => {
    setTimeout(() => {
      this.approvalEmitted = true;
      this.emitForTest({
        type: "tool.approval-required",
        sessionId,
        tool: "edit",
        args: { path: "src/needs-approval.ts" },
        requestId: "approval-request-1",
      });
    }, 0);
  });

  override readonly respondToApproval = vi.fn(async (sessionId: string, requestId: string, approved: boolean): Promise<void> => {
    this.emitForTest({
      type: "tool.result",
      sessionId,
      callId: "edit-call-1",
      tool: "edit",
      ok: approved,
      message: approved ? "Approved" : "Rejected",
      data: { requestId },
    });
    this.emitForTest({ type: "token", sessionId, content: approved ? "Approved and continuing." : "Rejected." });
    this.emitForTest({ type: "turn.completed", sessionId });
  });
}

async function waitForAssertion(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw lastError;
}

describe("chat external provider runtime mode selection", () => {
  it("streams actionable provider limit errors without retrying a fresh session", { timeout: 30_000 }, async () => {
    const provider = new MockCreditErrorChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { providerRegistry });
    const headers = await authHeaders();

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "continue the task",
        sessionId: "chat-provider-credit-error-session",
        provider: "codex",
        runtimeMode: "full-access",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("Your workspace is out of credits");
    expect(response.body).not.toContain('"message":"Internal error"');
    expect(provider.startSession).toHaveBeenCalledTimes(1);
    expect(provider.sendTurn).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it("passes the requested runtime mode to the provider and restarts when the mode changes", { timeout: 30_000 }, async () => {
    const provider = new MockChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { providerRegistry });
    const headers = await authHeaders();

    const supervised = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "hello",
        sessionId: "chat-runtime-mode-session",
        provider: "codex",
        runtimeMode: "supervised",
      },
    });

    expect(supervised.statusCode).toBe(200);
    expect(provider.startSession).toHaveBeenCalledTimes(1);
    expect(provider.startSession.mock.calls[0]?.[0]).toMatchObject({ mode: "supervised" });
    expect(provider.stopSession).not.toHaveBeenCalled();

    const fullAccess = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "hello again",
        sessionId: "chat-runtime-mode-session",
        provider: "codex",
        runtimeMode: "full-access",
      },
    });

    expect(fullAccess.statusCode).toBe(200);
    expect(provider.stopSession).toHaveBeenCalledTimes(1);
    expect(provider.startSession).toHaveBeenCalledTimes(2);
    expect(provider.startSession.mock.calls[1]?.[0]).toMatchObject({ mode: "full-access" });

    await app.close();
  });

  it("resolves supervised chat approval requests without leaving the stream open", { timeout: 30_000 }, async () => {
    const provider = new MockApprovalChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { providerRegistry });
    const headers = await authHeaders();
    const sessionId = "chat-approval-session";

    const responsePromise = app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "edit the file",
        sessionId,
        provider: "codex",
        runtimeMode: "supervised",
      },
    });

    await waitForAssertion(() => expect(provider.approvalEmitted).toBe(true));

    const approval = await app.inject({
      method: "POST",
      url: `/api/sessions/${sessionId}/approve`,
      headers,
      payload: { requestId: "approval-request-1", approved: true },
    });

    expect(approval.statusCode).toBe(200);
    expect(provider.respondToApproval).toHaveBeenCalledWith("mock-session-1", "approval-request-1", true);

    const response = await responsePromise;
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"type":"approval_required"');
    expect(response.body).toContain('"request_id":"approval-request-1"');
    expect(response.body).toContain('"type":"done"');

    await app.close();
  });

  it("includes the Jait system prompt in the first external-provider turn without streaming the context trace", { timeout: 30_000 }, async () => {
    const provider = new MockChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { providerRegistry });
    const headers = await authHeaders();

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "fix the bug",
        sessionId: "chat-system-prompt-trace-session",
        provider: "codex",
        runtimeMode: "full-access",
      },
    });

    expect(response.statusCode).toBe(200);

    const firstTurnMessage = provider.sendTurn.mock.calls[0]?.[1];
    expect(typeof firstTurnMessage).toBe("string");
    expect(firstTurnMessage).toContain("Jait session instructions:");
    expect(firstTurnMessage).toContain("use the todo tool even if you are operating through an external or CLI provider");
    expect(firstTurnMessage).toContain("Use the edit tool to modify files precisely.");
    expect(firstTurnMessage).toContain("User request:");
    expect(firstTurnMessage).toContain("fix the bug");

    expect(response.body).not.toContain("\"type\":\"context_flow\"");
    expect(response.body).not.toContain("Jait pasted its external-provider system prompt into this new provider session turn.");

    await app.close();
  });

  it("sends the full external-provider prompt even when the Jait backend is Ollama", { timeout: 30_000 }, async () => {
    const provider = new MockChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer({
      ...testConfig,
      llmProvider: "ollama",
      ollamaModel: "llama3.2",
    }, { providerRegistry });
    const headers = await authHeaders();

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "fix the bug",
        sessionId: "chat-ollama-cli-system-prompt-session",
        provider: "codex",
        runtimeMode: "full-access",
      },
    });

    expect(response.statusCode).toBe(200);

    const firstTurnMessage = provider.sendTurn.mock.calls[0]?.[1];
    expect(typeof firstTurnMessage).toBe("string");
    expect(firstTurnMessage).toContain("Jait session instructions:");
    expect(firstTurnMessage).toContain("You are operating inside Jait, a tool-centric coding project and gateway.");
    expect(firstTurnMessage).toContain("Use `jait.terminal` for direct terminal execution in Jait");
    expect(firstTurnMessage).toContain("The live preview is a controllable browser session.");
    expect(firstTurnMessage).toContain("Use the edit tool to modify files precisely.");
    expect(firstTurnMessage).not.toContain("You are an expert coding agent. Use tools to read, edit, search files and run commands.");

    await app.close();
  });

  it("includes the Jait system prompt in external-provider context trace for reused sessions", { timeout: 30_000 }, async () => {
    const provider = new MockChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { providerRegistry });
    const headers = await authHeaders();

    const sessionId = "chat-reused-system-prompt-trace-session";
    await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "first turn",
        sessionId,
        provider: "codex",
        runtimeMode: "full-access",
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "second turn",
        sessionId,
        provider: "codex",
        runtimeMode: "full-access",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(provider.startSession).toHaveBeenCalledTimes(1);

    const secondTurnMessage = provider.sendTurn.mock.calls[1]?.[1];
    expect(secondTurnMessage).toBe("second turn");
    expect(response.body).not.toContain("\"type\":\"context_flow\"");
    expect(response.body).not.toContain("session=reused");

    await app.close();
  });

  it("sends the last four active chat messages when starting a new provider session mid-chat", { timeout: 30_000 }, async () => {
    const provider = new MockChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { providerRegistry });
    const headers = await authHeaders();
    const sessionId = "chat-provider-switch-context-session";

    for (const content of ["first turn", "second turn", "third turn"]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/chat",
        headers,
        payload: {
          content,
          sessionId,
          provider: "codex",
          runtimeMode: "full-access",
        },
      });
      expect(response.statusCode).toBe(200);
    }

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "fourth turn",
        sessionId,
        provider: "codex",
        runtimeMode: "supervised",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(provider.startSession).toHaveBeenCalledTimes(2);
    expect(provider.stopSession).toHaveBeenCalledTimes(1);

    const handoffMessage = provider.sendTurn.mock.calls[3]?.[1];
    expect(typeof handoffMessage).toBe("string");
    expect(handoffMessage).toContain("Recent active chat context (last 4 messages before this turn):");
    expect(handoffMessage).not.toContain("User: first turn");
    expect(handoffMessage).toContain("User: second turn");
    expect(handoffMessage).toContain("Assistant: ok");
    expect(handoffMessage).toContain("User: third turn");
    expect(handoffMessage).toContain("User request:\nfourth turn");
    expect(response.body).not.toContain("\"type\":\"context_flow\"");
    expect(response.body).not.toContain("Recent active chat context (last 4 messages before this turn):");

    await app.close();
  });

  it("persists and streams todo_list updates from Codex todo completions", { timeout: 30_000 }, async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const provider = new MockTodoChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("todo-chat-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Todo Chat" });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);

    const app = await createServer(testConfig, {
      db,
      sqlite,
      providerRegistry,
      sessionService,
      sessionState,
      userService,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      payload: {
        content: "track this work with todos",
        sessionId: session.id,
        provider: "codex",
        runtimeMode: "full-access",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("\"type\":\"todo_list\"");
    expect(response.body).toContain("\"title\":\"Trace bug\"");

    expect(sessionState.get(session.id, ["todo_list"])).toEqual({
      todo_list: [
        { id: 1, title: "Trace bug", status: "in-progress" },
        { id: 2, title: "Patch bug", status: "not-started" },
      ],
    });

    await app.close();
    sqlite.close();
  });

  it("keeps external-provider tool calls interleaved with text after completion", { timeout: 30_000 }, async () => {
    const provider = new MockInterleavedToolChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { providerRegistry });
    const headers = await authHeaders();
    const sessionId = "chat-interleaved-tool-segments-session";

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "read then answer",
        sessionId,
        provider: "codex",
        runtimeMode: "full-access",
      },
    });

    expect(response.statusCode).toBe(200);

    const messagesResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${sessionId}/messages`,
      headers,
    });

    expect(messagesResponse.statusCode).toBe(200);
    const body = messagesResponse.json() as {
      messages: Array<{
        role: string;
        content: string;
        toolCalls?: Array<{ callId: string }>;
        segments?: Array<{ type: string; content?: string; callIds?: string[] }>;
      }>;
    };
    const assistantMessage = body.messages.find((message) => message.role === "assistant");
    expect(assistantMessage?.content).toBe("Before tool.\n\nAfter tool.");
    expect(assistantMessage?.toolCalls?.map((call) => call.callId)).toEqual(["tool-call-1"]);
    expect(assistantMessage?.segments).toEqual([
      { type: "text", content: "Before tool.\n" },
      { type: "toolGroup", callIds: ["tool-call-1"] },
      { type: "text", content: "\nAfter tool." },
    ]);

    await app.close();
  });

  it("preserves a cancelled external-provider partial answer after reload", { timeout: 30_000 }, async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const provider = new MockCancelledChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const sessionService = new SessionService(db);
    const userService = new UserService(db);
    const user = userService.createUser("cancelled-chat-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Cancelled Chat" });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const headers = { authorization: `Bearer ${token}` };

    const app = await createServer(testConfig, {
      db,
      sqlite,
      providerRegistry,
      sessionService,
      userService,
    });

    const responsePromise = app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "start a long answer",
        sessionId: session.id,
        provider: "codex",
        runtimeMode: "full-access",
      },
    });

    await waitForAssertion(() => expect(provider.partialEmitted).toBe(true));

    const cancelResponse = await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/cancel`,
      headers,
    });
    expect(cancelResponse.statusCode).toBe(200);
    expect(cancelResponse.json()).toMatchObject({ ok: true, cancelled: true });
    await responsePromise;

    const messagesResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/messages`,
      headers,
    });

    expect(messagesResponse.statusCode).toBe(200);
    const body = messagesResponse.json() as {
      messages: Array<{ role: string; content: string; segments?: Array<{ type: string; content?: string }> }>;
    };
    const assistantMessage = body.messages.find((message) => message.role === "assistant");
    expect(assistantMessage?.content).toBe("Partial answer before cancellation.");
    expect(assistantMessage?.segments).toEqual([
      { type: "text", content: "Partial answer before cancellation." },
      { type: "error", content: "Turn cancelled" },
    ]);

    await app.close();
    sqlite.close();
  });
});
