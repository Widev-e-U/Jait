import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { backgroundCommandMonitor } from "../services/background-command-monitor.js";
import { AuditWriter } from "../services/audit.js";
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
  buildCliProviderSystemPrompt,
  getExternalFileMutationPath,
  getProviderRequestErrorMessage,
  isNonRecoverableProviderRequestError,
  normalizeProviderSessionError,
} from "./chat.js";

describe("buildCliProviderSystemPrompt", () => {
  it("keeps Jait routing and user context without duplicating the full internal agent manual", () => {
    const prompt = buildCliProviderSystemPrompt("codex", "gpt-5.4", "agent", {
      projectRoot: "/work/project",
      architectureGraph: "graph TD; A-->B".repeat(500),
      projectInstructions: "Use the repository conventions.",
      skills: [{
        id: "debugging",
        name: "Debugging",
        description: "Use for root-cause analysis.",
        filePath: "/skills/debugging/SKILL.md",
        source: "bundled",
        enabled: true,
      }],
    });

    expect(prompt).toContain("always use `jait.terminal`");
    expect(prompt).toContain("/work/project");
    // Skills are lazy-discovered now: the prompt carries the discovery
    // instruction, not the skill's file path.
    expect(prompt).toContain("<skillDiscovery>");
    expect(prompt).not.toContain("/skills/debugging/SKILL.md");
    expect(prompt).toContain("Use the repository conventions.");
    expect(prompt).not.toContain("graph TD");
    expect(prompt).not.toContain("## Preambles and progress updates");
    expect(prompt.length).toBeLessThan(12_000);
  });
});

describe("canUseGatewayProviderForProject", () => {
  it("does not allow gateway CLI profiles in a remote project", () => {
    expect(canUseGatewayProviderForProject("desktop-windows-node")).toBe(false);
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

  readonly sendTurn = vi.fn(async (sessionId: string, _content?: string, _attachments?: unknown[]): Promise<void> => {
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

  readonly interruptTurn = vi.fn(async (): Promise<void> => {});

  async respondToApproval(): Promise<void> {
    return;
  }

  onEvent(handler: (event: ProviderEvent) => void): () => void {
    this.emitter.on("event", handler);
    return () => this.emitter.off("event", handler);
  }

  listenerCountForTest(): number {
    return this.emitter.listenerCount("event");
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

class MockHangingSendTurnChatProvider extends MockChatProvider {
  private releaseSendTurn: (() => void) | null = null;

  override readonly sendTurn = vi.fn(async (): Promise<void> => new Promise<void>((resolve) => {
    this.releaseSendTurn = resolve;
  }));

  release(): void {
    this.releaseSendTurn?.();
    this.releaseSendTurn = null;
  }
}

class MockHangingFirstTurnChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    if (this.sendTurn.mock.calls.length === 1) {
      return new Promise<void>(() => {});
    }
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "restarted" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 0);
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

class MockSilentChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
    setTimeout(() => {
      this.emitForTest({ type: "token", sessionId, content: "finished after silent reasoning" });
      this.emitForTest({ type: "turn.completed", sessionId });
    }, 400);
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
  it.each([false, true])("delivers uploaded images on first and reused turns, including display-segment uploads (recovery=%s)", async (recovery) => {
    const provider = new MockChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { providerRegistry });
    const image = { name: "colleague.png", mimeType: "image/png", data: "aGVsbG8=" };
    const document = { name: "notes.txt", mimeType: "text/plain", data: Buffer.from("colleague notes").toString("base64") };
    try {
      const headers = await authHeaders();
      for (const payload of [
        { content: "help me fix it", attachments: [image, document], displaySegments: [{ type: "image", ...image }] },
        { content: "", displaySegments: [{ type: "image", ...image }] },
      ]) {
        if (recovery && provider.sendTurn.mock.calls.length > 0) {
          provider.sendTurn.mockRejectedValueOnce(new Error("Session process exited"));
        }
        const response = await app.inject({
          method: "POST", url: "/api/chat", headers,
          payload: { ...payload, sessionId: `uploaded-images-session-${recovery}`, provider: "codex" },
        });
        expect(response.body).toContain('"type":"done"');
      }
      expect(provider.startSession).toHaveBeenCalledTimes(recovery ? 2 : 1);
      expect(provider.sendTurn).toHaveBeenCalledTimes(recovery ? 3 : 2);
      for (const call of provider.sendTurn.mock.calls) expect(call[2]).toEqual([image]);
      expect(provider.sendTurn.mock.calls[0]?.[1]).toContain("colleague notes");
      expect(provider.sendTurn.mock.calls[0]?.[1]).not.toContain(image.data);
    } finally {
      await app.close();
    }
  });

  it("runs Codex without an API key for the configured OpenCode Go backend", async () => {
    const provider = new MockChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer({ ...testConfig, llmProvider: "opencode-go", openaiApiKey: "" }, { providerRegistry });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/chat",
        headers: await authHeaders(),
        payload: { content: "hello", sessionId: "codex-without-go-key", provider: "codex", runtimeMode: "full-access" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('"type":"done"');
      expect(provider.sendTurn).toHaveBeenCalledOnce();
    } finally {
      await app.close();
    }
  });

  it("delivers background completions to an active CLI without exposing internal steering", async () => {
    const sessionId = "cli-hidden-background-completion";
    const monitorSpy = vi.spyOn(backgroundCommandMonitor, "setCompletionHandler");
    let completeCommand: () => Promise<void> = async () => {};
    class BackgroundProvider extends MockChatProvider {
      override readonly sendTurn = vi.fn(async (providerSessionId: string, _content?: string): Promise<void> => {
        if (this.sendTurn.mock.calls.length === 1) await completeCommand();
        setTimeout(() => {
          this.emitForTest({ type: "token", sessionId: providerSessionId, content: "verified" });
          this.emitForTest({ type: "turn.completed", sessionId: providerSessionId });
        }, 0);
      });
    }
    const provider = new BackgroundProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { providerRegistry });
    const handler = monitorSpy.mock.calls.at(-1)![0];
    completeCommand = async () => { await handler({
      sessionId, terminalId: "tty-hidden", command: "check-private-output", exitCode: 0,
      output: "private completion evidence", durationMs: 1000,
    }); };
    try {
      const headers = await authHeaders();
      const response = await app.inject({
        method: "POST", url: "/api/chat", headers,
        payload: { content: "verify", sessionId, provider: "codex", runtimeMode: "full-access" },
      });
      expect(response.statusCode).toBe(200);
      expect(provider.sendTurn).toHaveBeenCalledTimes(2);
      expect(provider.sendTurn.mock.calls[1]?.[1]).toContain("private completion evidence");
      expect(response.body).toContain('"type":"done"');
      expect(response.body).not.toContain('"type":"steering"');
      expect(response.body).not.toContain("private completion evidence");
      expect(response.body).not.toContain("[system-notification:");
      const history = await app.inject({ method: "GET", url: `/api/sessions/${sessionId}/messages`, headers });
      expect(history.statusCode).toBe(200);
      expect(history.body).not.toContain("private completion evidence");
      expect(history.body).not.toContain('"type":"steering"');
    } finally {
      monitorSpy.mockRestore();
      await app.close();
    }
  });

  it("allows a silent CLI turn to finish without interrupting it", { timeout: 30_000 }, async () => {
    expect(loadConfig()).not.toHaveProperty("cliTurnTimeoutMs");

    const provider = new MockSilentChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { providerRegistry });
    const headers = await authHeaders();

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "think carefully",
        sessionId: "chat-silent-turn-session",
        provider: "codex",
        runtimeMode: "full-access",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("finished after silent reasoning");
    expect(response.body).toContain('"type":"done"');
    expect(provider.interruptTurn).not.toHaveBeenCalled();

    await app.close();
  });

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
    expect(response.body).not.toContain('"type":"done"');
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

  it("restarts the provider session when the selected model or reasoning effort changes", { timeout: 30_000 }, async () => {
    const provider = new MockChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const app = await createServer(testConfig, { providerRegistry });
    const headers = await authHeaders();
    const sessionId = "chat-model-effort-session";

    await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "first turn",
        sessionId,
        provider: "codex",
        runtimeMode: "full-access",
        model: "gpt-5.6-sol",
        reasoningEffort: "high",
      },
    });

    await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "second turn",
        sessionId,
        provider: "codex",
        runtimeMode: "full-access",
        model: "gpt-5.6-terra",
        reasoningEffort: "ultra",
      },
    });

    expect(provider.stopSession).toHaveBeenCalledTimes(1);
    expect(provider.startSession).toHaveBeenCalledTimes(2);
    expect(provider.startSession.mock.calls[0]?.[0]).toMatchObject({
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
    });
    expect(provider.startSession.mock.calls[1]?.[0]).toMatchObject({
      model: "gpt-5.6-terra",
      reasoningEffort: "ultra",
    });

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
    expect(firstTurnMessage).toContain("Use the todo tool for multi-step work");
    expect(firstTurnMessage).toContain("always use `jait.terminal`");
    expect(firstTurnMessage).not.toContain("## Preambles and progress updates");
    expect(firstTurnMessage).toContain("User request:");
    expect(firstTurnMessage).toContain("fix the bug");

    expect(response.body).not.toContain("\"type\":\"context_flow\"");
    expect(response.body).not.toContain("Jait pasted its external-provider system prompt into this new provider session turn.");

    await app.close();
  });

  it("sends the compact external-provider prompt even when the Jait backend is Ollama", { timeout: 30_000 }, async () => {
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
    expect(firstTurnMessage).toContain("You are operating inside Jait, a tool-centric coding project.");
    expect(firstTurnMessage).toContain("always use `jait.terminal`");
    expect(firstTurnMessage).not.toContain("The live preview is a controllable browser session.");
    expect(firstTurnMessage).not.toContain("## Preambles and progress updates");

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

  it("clears the streaming flag instead of wedging the session when the requested provider is unavailable", { timeout: 30_000 }, async () => {
    // Regression test: the "!cliProvider" branch used to `return` directly
    // out of the SSE handler, which skipped the activeStreams cleanup that
    // normally runs after the try/catch. That left the session permanently
    // marked as streaming (stuck spinner, queued-forever messages) any time
    // a remote node briefly wasn't advertising the requested provider.
    const providerRegistry = new ProviderRegistry();
    const app = await createServer(testConfig, { providerRegistry });
    const headers = await authHeaders();
    const sessionId = "chat-unavailable-provider-session";

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "hello",
        sessionId,
        provider: "totally-bogus-provider",
        runtimeMode: "full-access",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("Unknown provider: totally-bogus-provider");

    const messagesResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${sessionId}/messages`,
      headers,
    });

    expect(messagesResponse.statusCode).toBe(200);
    expect(messagesResponse.json()).toMatchObject({ streaming: false });

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

  it("clears streaming when cancellation interrupts a hung provider sendTurn request", { timeout: 10_000 }, async () => {
    const provider = new MockHangingSendTurnChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const sessionService = new SessionService(db);
    const userService = new UserService(db);
    const user = userService.createUser("hung-cancel-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Hung Cancellation" });
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
        content: "start a turn whose provider request hangs",
        sessionId: session.id,
        provider: "codex",
        runtimeMode: "full-access",
      },
    });

    try {
      await waitForAssertion(() => expect(provider.sendTurn).toHaveBeenCalledTimes(1));

      const cancelResponse = await app.inject({
        method: "POST",
        url: `/api/sessions/${session.id}/cancel`,
        headers,
      });
      expect(cancelResponse.statusCode).toBe(200);
      expect(cancelResponse.json()).toMatchObject({ ok: true, cancelled: true });

      await Promise.race([
        responsePromise,
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Timed out waiting for cancelled chat response")), 500);
        }),
      ]);

      expect(provider.interruptTurn).toHaveBeenCalledWith("mock-session-1");
      expect(provider.stopSession).toHaveBeenCalledWith("mock-session-1");
      expect(provider.listenerCountForTest()).toBe(0);

      const approvalResponse = await app.inject({
        method: "POST",
        url: `/api/sessions/${session.id}/approve`,
        headers,
        payload: { requestId: "stale-request", approved: true },
      });
      expect(approvalResponse.statusCode).toBe(409);

      const messagesResponse = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/messages`,
        headers,
      });
      expect(messagesResponse.statusCode).toBe(200);
      expect(messagesResponse.json()).toMatchObject({ streaming: false });
    } finally {
      provider.release();
      await responsePromise;
      await app.close();
      sqlite.close();
    }
  });

  it("stops a hung CLI session before restart and starts a fresh provider session", { timeout: 10_000 }, async () => {
    const provider = new MockHangingFirstTurnChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const sessionService = new SessionService(db);
    const userService = new UserService(db);
    const user = userService.createUser("hung-restart-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Hung Restart" });
    const token = await signAuthToken(
      { id: user.id, username: user.username },
      testConfig.jwtSecret,
    );
    const headers = { authorization: `Bearer ${token}` };
    const app = await createServer(testConfig, {
      db,
      sqlite,
      providerRegistry,
      sessionService,
      userService,
    });

    const firstResponsePromise = app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "replace this hung turn",
        sessionId: session.id,
        provider: "codex",
        runtimeMode: "full-access",
      },
    });

    try {
      await waitForAssertion(() => expect(provider.sendTurn).toHaveBeenCalledTimes(1));
      const restartResponse = await Promise.race([
        app.inject({
          method: "POST",
          url: `/api/sessions/${session.id}/restart-from`,
          headers,
          payload: {
            messageFromEnd: 0,
            expectedContent: "replace this hung turn",
          },
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Timed out waiting for restart")), 1_000);
        }),
      ]);

      expect(restartResponse.statusCode).toBe(200);
      await firstResponsePromise;
      expect(provider.interruptTurn).toHaveBeenCalledWith("mock-session-1");
      expect(provider.stopSession).toHaveBeenCalledWith("mock-session-1");
      expect(provider.listenerCountForTest()).toBe(0);

      const secondResponse = await app.inject({
        method: "POST",
        url: "/api/chat",
        headers,
        payload: {
          content: "run after restart",
          sessionId: session.id,
          provider: "codex",
          runtimeMode: "full-access",
        },
      });
      expect(secondResponse.statusCode).toBe(200);
      expect(secondResponse.body).toContain("restarted");
      expect(provider.startSession).toHaveBeenCalledTimes(2);
      expect(provider.sendTurn.mock.calls.map(([providerSessionId]) => providerSessionId)).toEqual([
        "mock-session-1",
        "mock-session-2",
      ]);
      expect(provider.listenerCountForTest()).toBe(0);
    } finally {
      await app.close();
      sqlite.close();
    }
  });

  it("captures estimated metrics for external-provider turns and serves them via the context-flow endpoint", { timeout: 30_000 }, async () => {
    const provider = new MockChatProvider();
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(provider);
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const sessionService = new SessionService(db);
    const userService = new UserService(db);
    const user = userService.createUser("cli-metrics-chat-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "CLI Metrics Chat" });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const headers = { authorization: `Bearer ${token}` };

    const app = await createServer(testConfig, {
      db,
      sqlite,
      providerRegistry,
      sessionService,
      userService,
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {
        content: "say ok",
        sessionId: session.id,
        provider: "codex",
        runtimeMode: "full-access",
      },
    });
    expect(response.statusCode).toBe(200);

    // Locate the assistant message's visible index, then lazy-load its flow.
    const messagesResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/messages`,
      headers,
    });
    expect(messagesResponse.statusCode).toBe(200);
    const messages = messagesResponse.json() as { messages: Array<{ role: string; hasContextFlow?: boolean }> };
    const assistantIndex = messages.messages.findIndex((message) => message.role === "assistant");
    expect(assistantIndex).toBeGreaterThanOrEqual(0);
    expect(messages.messages[assistantIndex]?.hasContextFlow).toBe(true);

    const flowResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/messages/${assistantIndex}/context-flow`,
      headers,
    });
    expect(flowResponse.statusCode).toBe(200);
    const flow = flowResponse.json() as { contextFlow: { provider: string; rounds: Array<{ metrics?: Record<string, unknown> }> } };
    expect(flow.contextFlow.provider).toBe("codex");
    const metrics = flow.contextFlow.rounds[0]?.metrics;
    expect(metrics).toBeDefined();
    expect(metrics?.durationMs).toBeGreaterThanOrEqual(0);
    expect(metrics?.promptTokens).toBeGreaterThan(0);
    expect(metrics?.completionTokens).toBeGreaterThan(0);
    expect(metrics?.totalTokens).toBeGreaterThan(0);
    expect(metrics?.tokenUsageEstimated).toBe(true);
    // An immediate mock turn can finish within the same millisecond; a rate
    // cannot be calculated when the measured duration is zero.
    if ((metrics?.durationMs as number) > 0) {
      expect(metrics?.tokensPerSecond).toBeGreaterThan(0);
    } else {
      expect(metrics?.tokensPerSecond).toBeUndefined();
    }
    expect(metrics?.contextUsage).toMatchObject({ limit: expect.any(Number), ratio: expect.any(Number) });

    await app.close();
    sqlite.close();
  });
});

it("marks replies completed after a reader leaves as new unread activity", async () => {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const userService = new UserService(db);
  const user = userService.createUser("read-marker-owner", "password123");
  const sessionService = new SessionService(db);
  const session = sessionService.create({ userId: user.id });
  const provider = new MockChatProvider();
  const registry = new ProviderRegistry();
  registry.register(provider);
  let observedAt = "";
  const realTouch = sessionService.touch.bind(sessionService);
  vi.spyOn(sessionService, "touch").mockImplementation((id) => {
    realTouch(id);
    // Simulate the reader acknowledging the prompt, then leaving before the reply.
    if (!observedAt) {
      observedAt = sessionService.getById(id)!.lastActiveAt;
      sessionService.markViewed(id, user.id, observedAt);
    }
  });
  const app = await createServer(testConfig, { db, sqlite, sessionService, userService, providerRegistry: registry });
  try {
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const response = await app.inject({
      method: "POST", url: "/api/chat", headers: { authorization: `Bearer ${token}` },
      payload: { sessionId: session.id, content: "Reply after I leave", provider: "codex" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"type":"done"');
    const completed = sessionService.getById(session.id)!;
    expect(Date.parse(completed.lastActiveAt)).toBeGreaterThan(Date.parse(observedAt));
    expect(completed.viewedAt).toBe(observedAt);
  } finally {
    await app.close();
    sqlite.close();
  }
});

it.each([false, true])("keeps remote CLI startup on the selected device (personal=%s)", async (personal) => {
  const { ProjectService } = await import("../services/projects.js");
  const { SurfaceRegistry } = await import("../surfaces/registry.js");
  const { FileSystemSurfaceFactory } = await import("../surfaces/filesystem.js");
  const { RemoteFileSystemSurface } = await import("../surfaces/remote-filesystem.js");
  const { RemoteCliProvider } = await import("../providers/remote-cli-provider.js");
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const userService = new UserService(db);
  const user = userService.createUser("windows-project-owner", "password123");
  const projectService = new ProjectService(db);
  const root = "C:\\Users\\jakob\\Tankstelle";
  const node = { id: "windows-node", name: "Windows desktop", platform: "windows", clientId: "connected", providers: ["codex"] };
  const project = projectService.create({ userId: user.id, title: "Tankstelle", rootPath: root, nodeId: node.id });
  const sessionService = new SessionService(db);
  const session = sessionService.create(personal ? { userId: user.id } : { userId: user.id, projectId: project.id, projectPath: root });
  if (personal) sessionService.updateChatSelection(session.id, { nodeId: node.id }, user.id);
  const provider = new MockChatProvider();
  const spies = [
    vi.spyOn(RemoteCliProvider.prototype, "startSession").mockImplementation(provider.startSession),
    vi.spyOn(RemoteCliProvider.prototype, "sendTurn").mockImplementation(provider.sendTurn),
    vi.spyOn(RemoteCliProvider.prototype, "checkAvailability").mockResolvedValue(true),
    vi.spyOn(RemoteCliProvider.prototype, "onEvent").mockImplementation(provider.onEvent.bind(provider)),
    vi.spyOn(RemoteCliProvider.prototype, "stopSession").mockResolvedValue(),
  ];
  const ws = {
    canAccessNode: (_id: string, userId: string | null) => userId === user.id,
    getFsNodes: () => [node], findNodeByDeviceId: () => node,
    broadcast: vi.fn(), broadcastToUser: vi.fn(), registerGatewayFsNode: vi.fn(),
    proxyFsOp: vi.fn(async () => ({ isDirectory: true })),
  } as unknown as import("../ws.js").WsControlPlane;
  const surfaceRegistry = new SurfaceRegistry();
  surfaceRegistry.register(new FileSystemSurfaceFactory());
  const remote = new RemoteFileSystemSurface("windows-files", ws);
  if (!personal) {
    await remote.start({ sessionId: session.id, projectRoot: root, nodeId: node.id });
    surfaceRegistry.registerInstance(remote.id, remote);
  }
  const gatewayProvider = new MockChatProvider();
  const registry = new ProviderRegistry();
  registry.register(gatewayProvider);
  const app = await createServer(testConfig, { db, sqlite, sessionService, projectService, userService, surfaceRegistry, ws, providerRegistry: registry, audit: new AuditWriter(db) });
  try {
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const response = await app.inject({ method: "POST", url: "/api/chat", headers: { authorization: `Bearer ${token}` }, payload: { sessionId: session.id, content: "hello", provider: "codex" } });
    expect(response.body).toContain('"type":"done"');
    expect(provider.startSession).toHaveBeenCalledWith(expect.objectContaining({ workingDirectory: personal ? "." : root }));
    expect(surfaceRegistry.getBySession(session.id).map((s) => s.type)).toEqual(personal ? [] : ["remote-filesystem"]);
    expect(provider.sendTurn.mock.calls[0]?.[1]).toContain("OS: Windows");
    expect(provider.sendTurn.mock.calls[0]?.[1]).toContain("Shell: PowerShell");
    if (personal) {
      const headers = { authorization: `Bearer ${token}` };
      const prewarm = await app.inject({ method: "POST", url: "/api/chat/prewarm", headers, payload: { sessionId: session.id, provider: "codex" } });
      expect(prewarm.json().status).toBe("skipped");
      ws.getFsNodes = () => [];
      const offline = await app.inject({ method: "POST", url: "/api/chat", headers, payload: { sessionId: session.id, content: "offline turn", provider: "codex" } });
      expect(offline.body).toContain("unavailable");
      expect(gatewayProvider.startSession).not.toHaveBeenCalled();
      // A filesystem surface left by an earlier project must not override
      // the explicit personal selection when switching back to the gateway.
      await remote.start({ sessionId: session.id, projectRoot: root, nodeId: node.id });
      surfaceRegistry.registerInstance(remote.id, remote);
      const changed = await app.inject({ method: "PATCH", url: `/api/sessions/${session.id}`, headers, payload: { nodeId: "gateway" } });
      expect(changed.statusCode).toBe(200);
      const local = await app.inject({ method: "POST", url: "/api/chat", headers, payload: { sessionId: session.id, content: "gateway turn", provider: "codex" } });
      expect(local.body).toContain('"type":"done"');
      expect(gatewayProvider.startSession).toHaveBeenCalledTimes(1);
      expect(gatewayProvider.startSession).toHaveBeenCalledWith(expect.objectContaining({ workingDirectory: process.cwd() }));
      expect(spies[4]).toHaveBeenCalled();
      // A saved binding does not authorize a device after ownership changes.
      sessionService.updateChatSelection(session.id, { nodeId: node.id }, user.id);
      ws.canAccessNode = () => false;
      const denied = await app.inject({ method: "POST", url: "/api/chat", headers, payload: { sessionId: session.id, content: "revoked device", provider: "codex" } });
      expect(denied.statusCode).toBe(403);
      expect(denied.json().error).toBe("NODE_FORBIDDEN");
      expect(gatewayProvider.startSession).toHaveBeenCalledTimes(1);
    }
  } finally {
    await app.close();
    sqlite.close();
    for (const spy of spies) spy.mockRestore();
  }
});
