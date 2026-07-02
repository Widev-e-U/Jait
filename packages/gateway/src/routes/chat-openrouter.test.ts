import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { SessionService } from "../services/sessions.js";
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

function createDelayedOpenAIStreamResponse(delayMs = 80): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"A"},"finish_reason":null}]}\n\n'));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"B"},"finish_reason":null}]}\n\n'));
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
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
    embedding: {},
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

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("http://127.0.0.1:")) {
        return originalFetch(input, init);
      }
      expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
      return createDelayedOpenAIStreamResponse();
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
      const startedAt = Date.now();
      const seen: Array<{ token: string; at: number }> = [];
      let body = "";

      while (reader && seen.length < 2) {
        const { done, value } = await reader.read();
        if (done) break;
        body += decoder.decode(value, { stream: true });
        if (body.includes('"type":"token","content":"A"') && !seen.some((entry) => entry.token === "A")) {
          seen.push({ token: "A", at: Date.now() - startedAt });
        }
        if (body.includes('"type":"token","content":"B"') && !seen.some((entry) => entry.token === "B")) {
          seen.push({ token: "B", at: Date.now() - startedAt });
        }
      }
      await reader?.cancel().catch(() => {});

      expect(body).not.toContain('"type":"context_flow"');
      expect(seen.map((entry) => entry.token)).toEqual(["A", "B"]);
      expect(seen[1]!.at - seen[0]!.at).toBeGreaterThanOrEqual(40);
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
      content: "Jakob prefers concise progress updates that mention test evidence.",
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
