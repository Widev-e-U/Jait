import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { SessionService } from "../services/sessions.js";
import { SessionStateService } from "../services/session-state.js";
import { UserService } from "../services/users.js";
import { signAuthToken } from "../security/http-auth.js";
import type { MemoryEntry, MemoryScope, MemoryService, SaveMemoryInput } from "../memory/contracts.js";
import { MemoryEngine } from "../memory/service.js";
import { SqliteMemoryBackend } from "../memory/sqlite-backend.js";
import { ToolRegistry } from "../tools/registry.js";

const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};

const originalFetch = globalThis.fetch;

function createOpenAIStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"ok"},"finish_reason":null}]}\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function createControlledOpenAIStreamResponse(): {
  response: Response;
  releaseSecondChunk: () => void;
} {
  const encoder = new TextEncoder();
  let releaseSecondChunk = () => {};
  const secondChunkReady = new Promise<void>((resolve) => {
    releaseSecondChunk = resolve;
  });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"A"},"finish_reason":null}]}\n\n'));
      await secondChunkReady;
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"B"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return {
    response: new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
    releaseSecondChunk,
  };
}

function createToolCallStreamResponse(): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_cancel_proof","type":"function","function":{"name":"proof_cancel","arguments":"{}"}}]},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "mem-project-1",
    scope: "project",
    content: "The project prefers compact todo controls with icon-only status and priority selectors.",
    source: { type: "test", id: "session-1", surface: "chat" },
    createdAt: "2026-05-24T00:00:00.000Z",
    updatedAt: "2026-05-24T00:00:00.000Z",
    ...overrides,
  };
}

function createMockMemoryService(entries: MemoryEntry[]): MemoryService {
  return {
    save: async (input: SaveMemoryInput) => memoryEntry({ content: input.content, scope: input.scope, source: input.source }),
    list: async (scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope),
    search: async (_query: string, limit = 5, scope?: MemoryScope) => entries.filter((entry) => !scope || entry.scope === scope).slice(0, limit),
    forget: async () => false,
    forgetExpired: async () => 0,
    flushPreCompaction: async () => 0,
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("chat route OpenRouter backend selection", () => {
  it("routes Jait chat through OpenRouter when the backend setting is openrouter", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("openrouter-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "OpenRouter Session" });

    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: {
        OPENROUTER_API_KEY: "openrouter-test-key",
      },
    });

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect((init?.headers as Record<string, string> | undefined)?.["Authorization"]).toBe("Bearer openrouter-test-key");

      const body = JSON.parse(String(init?.body)) as { model: string; messages: Array<{ role: string; content: string }> };
      expect(body.model).toBe("openai/gpt-4o");
      expect(body.messages.at(-1)).toMatchObject({ role: "user", content: "hello" });

      return createOpenAIStreamResponse();
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: "hello",
        sessionId: session.id,
        model: "gpt-4o",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it("uses per-request reasoning effort while preserving explicit Default", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("openrouter-effort-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "OpenRouter Effort Session" });
    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      reasoningEffort: "low",
      apiKeys: { OPENROUTER_API_KEY: "openrouter-test-key" },
    });

    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return createOpenAIStreamResponse();
    }) as typeof fetch;

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
    });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const send = (content: string, reasoningEffort: string | null | undefined) => app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content,
        sessionId: session.id,
        model: "gpt-4o",
        ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
      },
    });

    expect((await send("explicit high", "high")).statusCode).toBe(200);
    expect((await send("explicit default", null)).statusCode).toBe(200);
    expect((await send("fallback", undefined)).statusCode).toBe(200);

    expect(bodies[0]?.["reasoning_effort"]).toBe("high");
    expect(Object.hasOwn(bodies[1] ?? {}, "reasoning_effort")).toBe(false);
    expect(bodies[2]?.["reasoning_effort"]).toBe("low");

    await app.close();
  });

  it("preserves an explicit Default through queued native turns", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const user = userService.createUser("openrouter-queued-effort-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Queued Effort Session" });
    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      reasoningEffort: "low",
      apiKeys: { OPENROUTER_API_KEY: "openrouter-test-key" },
    });

    const controlledStream = createControlledOpenAIStreamResponse();
    const bodies: Array<Record<string, unknown>> = [];
    let resolveFirstFetch = () => {};
    const firstFetchStarted = new Promise<void>((resolve) => {
      resolveFirstFetch = resolve;
    });
    globalThis.fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      resolveFirstFetch();
      return bodies.length === 1 ? controlledStream.response : createOpenAIStreamResponse();
    }) as typeof fetch;

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
      sessionState,
    });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const firstResponse = app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: "slow queued effort turn",
        sessionId: session.id,
        model: "gpt-4o",
        reasoningEffort: "high",
      },
    });
    await firstFetchStarted;

    const queuedResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: "queued explicit default",
        sessionId: session.id,
        model: "gpt-4o",
        reasoningEffort: null,
      },
    });
    expect(queuedResponse.statusCode).toBe(202);

    const queued = sessionState.get(session.id, ["queued_messages"])["queued_messages"] as Array<Record<string, unknown>>;
    expect(queued).toHaveLength(1);
    expect(Object.hasOwn(queued[0] ?? {}, "reasoningEffort")).toBe(true);
    expect(queued[0]?.["reasoningEffort"]).toBeNull();

    controlledStream.releaseSecondChunk();
    await firstResponse;
    const serverWithQueueDrain = app as typeof app & {
      drainQueuedChatMessages?: (sessionId: string) => Promise<void>;
    };
    for (let attempt = 0; attempt < 20 && bodies.length < 2; attempt += 1) {
      await serverWithQueueDrain.drainQueuedChatMessages?.(session.id);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.["reasoning_effort"]).toBe("high");
    expect(Object.hasOwn(bodies[1] ?? {}, "reasoning_effort")).toBe(false);

    await app.close();
  });

  it("flushes Jait provider token chunks over live HTTP without streaming context_flow first", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("openrouter-cadence-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "OpenRouter Cadence Session" });

    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: {
        OPENROUTER_API_KEY: "openrouter-test-key",
      },
    });

    const controlledStream = createControlledOpenAIStreamResponse();
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("http://127.0.0.1:")) {
        return originalFetch(input, init);
      }
      expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
      return controlledStream.response;
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
    });
    await app.listen({ port: 0, host: "127.0.0.1" });

    try {
      const address = app.server.address() as AddressInfo;
      const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
      const response = await originalFetch(`http://127.0.0.1:${address.port}/api/chat`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          content: "reply in two chunks",
          sessionId: session.id,
          model: "glm-5.2:cloud",
        }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");

      const reader = response.body?.getReader();
      expect(reader).toBeTruthy();
      const decoder = new TextDecoder();
      let body = "";

      while (reader && !body.includes('"type":"token","content":"A"')) {
        const { done, value } = await reader.read();
        if (done) break;
        body += decoder.decode(value, { stream: true });
      }

      expect(body).not.toContain('"type":"context_flow"');
      expect(body).toContain('"type":"token","content":"A"');
      expect(body).not.toContain('"type":"token","content":"B"');

      controlledStream.releaseSecondChunk();
      while (reader && !body.includes('"type":"token","content":"B"')) {
        const { done, value } = await reader.read();
        if (done) break;
        body += decoder.decode(value, { stream: true });
      }
      await reader?.cancel().catch(() => {});

      expect(body).toContain('"type":"token","content":"B"');
    } finally {
      await app.close();
    }
  });

  it("persists an interrupted assistant tool card before clearing live stream state", { timeout: 15_000 }, async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("cancel-persist-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Cancel Persistence Session" });
    const toolRegistry = new ToolRegistry();

    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: {
        OPENROUTER_API_KEY: "openrouter-test-key",
      },
    });

    toolRegistry.register({
      name: "proof.cancel",
      description: "Proof tool that runs until the chat turn is cancelled.",
      tier: "core",
      category: "meta",
      parameters: { type: "object", properties: {} },
      execute: async (_input, context) => new Promise((resolve) => {
        const finish = () => resolve({ ok: false, message: "Cancelled by test" });
        if (context.signal?.aborted) {
          finish();
          return;
        }
        context.signal?.addEventListener("abort", finish, { once: true });
      }),
    });

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("http://127.0.0.1:")) {
        return originalFetch(input, init);
      }
      expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
      return createToolCallStreamResponse();
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
      toolRegistry,
    });
    await app.listen({ port: 0, host: "127.0.0.1" });

    try {
      const address = app.server.address() as AddressInfo;
      const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
      const headers = {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      };
      const response = await originalFetch(`http://127.0.0.1:${address.port}/api/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          content: "start a cancellable tool",
          sessionId: session.id,
          model: "gpt-4o",
        }),
      });

      expect(response.status).toBe(200);
      const reader = response.body?.getReader();
      expect(reader).toBeTruthy();
      const decoder = new TextDecoder();
      let streamBody = "";
      const startedAt = Date.now();
      while (!streamBody.includes('"type":"tool_start"')) {
        const { done, value } = await reader!.read();
        expect(done).toBe(false);
        const chunk = decoder.decode(value, { stream: true });
        streamBody += chunk;
        if (Date.now() - startedAt > 5000) throw new Error("Timed out waiting for tool_start");
      }

      const cancelResponse = await originalFetch(`http://127.0.0.1:${address.port}/api/sessions/${session.id}/cancel`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(cancelResponse.status).toBe(200);

      while (!streamBody.includes('"type":"done"')) {
        const { done, value } = await reader!.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        streamBody += chunk;
        if (Date.now() - startedAt > 10000) throw new Error("Timed out waiting for done");
      }
      await reader?.cancel().catch(() => {});

      const messagesResponse = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/messages`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(messagesResponse.statusCode).toBe(200);
      const messagesBody = messagesResponse.json() as {
        messages: Array<{
          role: string;
          content: string;
          toolCalls?: Array<{ callId: string; tool: string; ok?: boolean; message?: string }>;
          segments?: Array<{ type: string; callIds?: string[] }>;
        }>;
      };
      const assistantMessage = messagesBody.messages.find((message) => message.role === "assistant");
      expect(assistantMessage?.toolCalls).toEqual([
        expect.objectContaining({
          callId: "call_cancel_proof",
          tool: "proof.cancel",
          ok: false,
          message: "Cancelled",
        }),
      ]);
      expect(assistantMessage?.segments).toEqual([
        expect.objectContaining({ type: "toolGroup", callIds: ["call_cancel_proof"] }),
      ]);
    } finally {
      await app.close();
    }
  });

  it("reports the real tool-call start time on repeated snapshot polls instead of resetting to 'now' each time", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("slow-tool-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Slow Tool Session" });
    const toolRegistry = new ToolRegistry();

    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: {
        OPENROUTER_API_KEY: "openrouter-test-key",
      },
    });

    let resolveTool: (() => void) | undefined;
    toolRegistry.register({
      name: "proof.cancel",
      description: "Proof tool that stays running until the test resolves it.",
      tier: "core",
      category: "meta",
      parameters: { type: "object", properties: {} },
      execute: () => new Promise((resolve) => {
        resolveTool = () => resolve({ ok: true, message: "Done" });
      }),
    });

    let openrouterCallCount = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("http://127.0.0.1:")) {
        return originalFetch(input, init);
      }
      expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
      openrouterCallCount++;
      // First round: request the slow tool call. Once its result comes back,
      // the agent loop makes a second round — return a plain final answer so
      // the turn actually ends instead of looping on the same tool forever.
      return openrouterCallCount === 1 ? createToolCallStreamResponse() : createOpenAIStreamResponse();
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
      toolRegistry,
    });
    await app.listen({ port: 0, host: "127.0.0.1" });

    try {
      const address = app.server.address() as AddressInfo;
      const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
      const headers = {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      };
      const response = await originalFetch(`http://127.0.0.1:${address.port}/api/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          content: "start a slow tool",
          sessionId: session.id,
          model: "gpt-4o",
        }),
      });

      expect(response.status).toBe(200);
      const reader = response.body?.getReader();
      expect(reader).toBeTruthy();
      const decoder = new TextDecoder();
      let streamBody = "";
      const waitStartedAt = Date.now();
      while (!streamBody.includes('"type":"tool_start"')) {
        const { done, value } = await reader!.read();
        expect(done).toBe(false);
        streamBody += decoder.decode(value, { stream: true });
        if (Date.now() - waitStartedAt > 5000) throw new Error("Timed out waiting for tool_start");
      }

      type ToolCallSnapshot = { callId: string; status?: string; startedAt?: number };
      const pollRunningToolCall = async (): Promise<ToolCallSnapshot> => {
        const messagesResponse = await app.inject({
          method: "GET",
          url: `/api/sessions/${session.id}/messages`,
          headers: { authorization: `Bearer ${token}` },
        });
        expect(messagesResponse.statusCode).toBe(200);
        const body = messagesResponse.json() as {
          messages: Array<{ role: string; toolCalls?: ToolCallSnapshot[] }>;
        };
        const assistantMessage = body.messages.find((m) => m.role === "assistant");
        const toolCall = assistantMessage?.toolCalls?.find((tc) => tc.callId === "call_cancel_proof");
        expect(toolCall?.status).toBe("running");
        return toolCall!;
      };

      // Reconnecting mid-execution must report a real, in-the-past start time —
      // not "now" — so the client can show meaningful elapsed time immediately.
      const firstPoll = await pollRunningToolCall();
      expect(firstPoll.startedAt).toBeDefined();
      expect(Date.now() - firstPoll.startedAt!).toBeGreaterThanOrEqual(0);

      await new Promise((resolve) => setTimeout(resolve, 120));

      // A second reconnect while the tool is STILL running must report the
      // SAME startedAt as the first poll — this is the regression this test
      // guards: before the fix, every snapshot re-stamped startedAt to the
      // poll's own Date.now(), so two polls 120ms apart each showed ~0ms
      // elapsed and disagreed with each other.
      const secondPoll = await pollRunningToolCall();
      expect(secondPoll.startedAt).toBe(firstPoll.startedAt);
      expect(Date.now() - secondPoll.startedAt!).toBeGreaterThanOrEqual(100);

      resolveTool?.();
      const drainStartedAt = Date.now();
      while (!streamBody.includes('"type":"done"')) {
        const { done, value } = await reader!.read();
        if (done) break;
        streamBody += decoder.decode(value, { stream: true });
        if (Date.now() - drainStartedAt > 10000) throw new Error("Timed out waiting for done");
      }
      await reader?.cancel().catch(() => {});
    } finally {
      resolveTool?.();
      await app.close();
    }
  });

  it("streams a simple ok reply for the Jait provider with mimo v2 pro selected", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("openrouter-mimo-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "OpenRouter Mimo Session" });

    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: {
        OPENROUTER_API_KEY: "openrouter-test-key",
      },
    });

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      expect(String(input)).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect((init?.headers as Record<string, string> | undefined)?.["Authorization"]).toBe("Bearer openrouter-test-key");

      const body = JSON.parse(String(init?.body)) as { model: string; messages: Array<{ role: string; content: string }> };
      expect(body.model).toBe("xiaomi/mimo-v2-pro");
      expect(body.messages.at(-1)).toMatchObject({ role: "user", content: "reply ok" });

      return createOpenAIStreamResponse();
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: "reply ok",
        sessionId: session.id,
        model: "xiaomi/mimo-v2-pro",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(response.body).toContain('"type":"token","content":"ok"');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const messagesResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/messages`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(messagesResponse.statusCode).toBe(200);
    const messagesBody = messagesResponse.json() as {
      messages: Array<{
        role: string;
        content: string;
        hasContextFlow?: boolean;
        hasMemoryProvenance?: boolean;
      }>;
    };
    const assistantMessage = messagesBody.messages.find((msg) => msg.role === "assistant");
    expect(assistantMessage?.hasContextFlow).toBe(true);
    // contextFlow is lazy-loaded via the context-flow endpoint
    const assistantIndex = messagesBody.messages.findIndex((msg) => msg.role === "assistant");
    const cfResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/messages/${assistantIndex}/context-flow`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(cfResponse.statusCode).toBe(200);
    const cfBody = cfResponse.json() as {
      contextFlow?: {
        provider: string;
        model: string;
        rounds: Array<{ model: string; messages: Array<{ role: string; content: string }> }> };
    };
    const contextFlow = cfBody.contextFlow;
    expect(contextFlow).toMatchObject({
      provider: "jait",
      model: "xiaomi/mimo-v2-pro",
    });
    expect(contextFlow?.rounds[0]?.messages[0]).toMatchObject({
      role: "system",
    });
    expect(String(contextFlow?.rounds[0]?.messages[0]?.content ?? "")).toContain("Your name is Jait");
    expect(contextFlow?.rounds[0]?.messages.at(-1)).toMatchObject({
      role: "user",
      content: "reply ok",
    });

    await app.close();
  });

  it("injects project-scoped relevant memory into Jait model context", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("memory-context-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Memory Context Session" });
    const memoryService = createMockMemoryService([
      memoryEntry(),
    ]);

    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: {
        OPENROUTER_API_KEY: "openrouter-test-key",
      },
    });

    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
      const memoryMessage = body.messages.find((message) => String(message.content).includes("<relevant_memory>"));
      expect(memoryMessage).toMatchObject({ role: "system" });
      expect(String(memoryMessage?.content)).toContain("mem-project-1");
      expect(body.messages.at(-1)).toMatchObject({ role: "system" });

      return createOpenAIStreamResponse();
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
      memoryService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: "use our todo controls preference",
        sessionId: session.id,
        model: "gpt-4o",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("mem-project-1");
    expect(response.body).toContain('"sourceType":"test"');
    expect(response.body).toContain('"sourceId":"session-1"');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it("evaluates memory retrieval with seeded prior sessions before sending model context", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("memory-eval-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Memory Evaluation Session" });
    const memoryService = new MemoryEngine({ backend: new SqliteMemoryBackend(db) });

    await memoryService.save({
      scope: "project",
      content: "Shared API request and response contracts should live in packages/shared before gateway or web imports them.",
      source: { type: "chat", id: "prior-session-contracts", surface: "chat" },
    });
    await memoryService.save({
      scope: "contact",
      content: "Alice prefers concise progress updates that mention test evidence.",
      source: { type: "chat", id: "prior-session-progress", surface: "chat" },
    });
    await memoryService.save({
      scope: "project",
      content: "Android release artifacts are built by the release workflow.",
      source: { type: "chat", id: "prior-session-release", surface: "chat" },
    });

    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: {
        OPENROUTER_API_KEY: "openrouter-test-key",
      },
    });

    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ role: string; content: string }> };
      const memoryMessage = body.messages.find((message) => String(message.content).includes("<relevant_memory>"));
      const memoryContent = String(memoryMessage?.content ?? "");

      expect(memoryMessage).toMatchObject({ role: "system" });
      expect(memoryContent).toContain("prior-session-contracts");
      expect(memoryContent).toContain("packages/shared");
      expect(memoryContent).toContain("prior-session-progress");
      expect(memoryContent).toContain("concise progress updates");
      expect(memoryContent).not.toContain("prior-session-release");
      expect(body.messages.at(-1)).toMatchObject({
        role: "user",
        content: "Based on what you know, where should shared API contracts live and how should progress updates be written?",
      });

      return createOpenAIStreamResponse();
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
      memoryService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: "Based on what you know, where should shared API contracts live and how should progress updates be written?",
        sessionId: session.id,
        model: "gpt-4o",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("prior-session-contracts");
    expect(response.body).toContain("prior-session-progress");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it("does not use a CLI worker model for the Jait swarm coordinator", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("swarm-openrouter-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Swarm Session" });

    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: {
        OPENROUTER_API_KEY: "openrouter-test-key",
      },
    });

    const fetchMock = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { model: string };
      expect(body.model).toBe("openai/gpt-4o");
      expect(body.model).not.toBe("gpt-5-codex");
      return createOpenAIStreamResponse();
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: "evaluate rust rewrite",
        sessionId: session.id,
        mode: "swarm",
        provider: "codex",
        model: "gpt-5-codex",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it("fails clearly when OpenRouter is selected without an OpenRouter key", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("openrouter-misconfigured", "password123");
    const session = sessionService.create({ userId: user.id, name: "Missing Key Session" });

    userService.updateSettings(user.id, {
      jaitBackend: "openrouter",
      apiKeys: {},
    });

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        content: "hello",
        sessionId: session.id,
        model: "gpt-4o",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "CONFIG_ERROR",
      details: "OPENROUTER_API_KEY is required when the Jait backend provider is set to OpenRouter",
    });

    await app.close();
  });
});
