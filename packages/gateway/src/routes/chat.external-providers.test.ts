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
import { getExternalFileMutationPath } from "./chat.js";

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

  readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
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

class MockTodoChatProvider extends MockChatProvider {
  override readonly sendTurn = vi.fn(async (sessionId: string): Promise<void> => {
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

describe("chat external provider runtime mode selection", () => {
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

  it("includes the Jait system prompt in the first external-provider turn and context trace", { timeout: 30_000 }, async () => {
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
    expect(firstTurnMessage).toContain("User request:");
    expect(firstTurnMessage).toContain("fix the bug");

    expect(response.body).toContain("\"type\":\"context_flow\"");
    expect(response.body).toContain("use the todo tool even if you are operating through an external or CLI provider");

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
    expect(response.body).toContain("session=reused");
    expect(response.body).toContain("\"role\":\"system\"");
    expect(response.body).toContain("use the todo tool even if you are operating through an external or CLI provider");
    expect(response.body).toContain("shown for inspection even though it was only sent");

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
});
