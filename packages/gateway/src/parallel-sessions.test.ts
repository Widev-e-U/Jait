import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "./server.js";
import { loadConfig } from "./config.js";
import {
  createServer as createHttpServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { signAuthToken } from "./security/http-auth.js";

/* -------------------------------------------------------------------------- */
/*  Mock Ollama                                                               */
/*  Streams back "Echo: <last user message>" as space-delimited tokens.       */
/*  Each token is delayed by `tokenDelayMs` to simulate real LLM latency.     */
/* -------------------------------------------------------------------------- */

const TOKEN_DELAY_MS = 80;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

function startMockOllama(delayMs = TOKEN_DELAY_MS): Promise<Server> {
  return new Promise((resolve) => {
    const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
        res.writeHead(404);
        res.end();
        return;
      }

      const rawBody = await collectBody(req);
      const { messages } = JSON.parse(rawBody) as {
        messages: { role: string; content: string }[];
      };

      const lastUserMsg =
        messages
          .filter((m) => m.role === "user")
          .pop()?.content ?? "unknown";

      const reply = `Echo: ${lastUserMsg}`;
      const words = reply.split(" ");

      res.writeHead(200, { "Content-Type": "text/event-stream" });

      for (let i = 0; i < words.length; i++) {
        const token = words[i] + (i < words.length - 1 ? " " : "");
        const chunk = {
          choices: [{ delta: { content: token }, finish_reason: null }],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        await sleep(delayMs);
      }

      res.write("data: [DONE]\n\n");
      res.end();
    });

    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/** Parse all SSE `data:` lines from a raw response body */
function parseSSE(body: string) {
  return body
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
}

/** Concatenate all `token` events into a single string */
function tokensToString(events: Record<string, unknown>[]) {
  return events
    .filter((e) => e.type === "token")
    .map((e) => e.content as string)
    .join("");
}

/* -------------------------------------------------------------------------- */
/*  Tests                                                                     */
/* -------------------------------------------------------------------------- */

describe("parallel session chat (E2E)", () => {
  let mockOllama: Server;
  let ollamaUrl: string;

  beforeAll(async () => {
    mockOllama = await startMockOllama();
    const addr = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((r) => mockOllama.close(() => r()));
  });

  function testConfig() {
    return {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
    };
  }



  async function setupAuthedApp() {
    const config = testConfig();
    const app = await createServer(config);
    const token = await signAuthToken({ id: "parallel-user", username: "parallel" }, config.jwtSecret);
    const authHeaders = { authorization: `Bearer ${token}` };

    const inject = (options: Parameters<typeof app.inject>[0]) => app.inject({
      ...options,
      headers: {
        ...authHeaders,
        ...(("headers" in options && options.headers) ? options.headers : {}),
      },
    });

    const authFetch: typeof fetch = (input, init) => fetch(input, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });

    return { app, inject, authFetch };
  }

  /* ----- 1. Two parallel requests to different sessions both complete ---- */

  it("parallel chat to two sessions yields independent histories", async () => {
    const { app, inject, authFetch } = await setupAuthedApp();

    const [res1, res2] = await Promise.all([
      inject({
        method: "POST",
        url: "/api/chat",
        payload: { content: "hello from session A", sessionId: "par-a" },
      }),
      inject({
        method: "POST",
        url: "/api/chat",
        payload: { content: "hello from session B", sessionId: "par-b" },
      }),
    ]);

    // Both return 200
    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);

    // Both produce token + done events
    const events1 = parseSSE(res1.body);
    const events2 = parseSSE(res2.body);

    expect(events1.some((e) => e.type === "token")).toBe(true);
    expect(events1.some((e) => e.type === "done")).toBe(true);
    expect(events2.some((e) => e.type === "token")).toBe(true);
    expect(events2.some((e) => e.type === "done")).toBe(true);

    // Verify streamed content matches
    expect(tokensToString(events1)).toBe("Echo: hello from session A");
    expect(tokensToString(events2)).toBe("Echo: hello from session B");

    // Verify session histories are independent
    const histA = await inject({ method: "GET", url: "/api/sessions/par-a/messages" });
    const histB = await inject({ method: "GET", url: "/api/sessions/par-b/messages" });

    const msgsA = (JSON.parse(histA.body) as { messages: { role: string; content: string }[] }).messages;
    const msgsB = (JSON.parse(histB.body) as { messages: { role: string; content: string }[] }).messages;

    expect(msgsA).toHaveLength(2);
    expect(msgsB).toHaveLength(2);

    // Session A
    expect(msgsA[0].role).toBe("user");
    expect(msgsA[0].content).toBe("hello from session A");
    expect(msgsA[1].role).toBe("assistant");
    expect(msgsA[1].content).toBe("Echo: hello from session A");

    // Session B
    expect(msgsB[0].role).toBe("user");
    expect(msgsB[0].content).toBe("hello from session B");
    expect(msgsB[1].role).toBe("assistant");
    expect(msgsB[1].content).toBe("Echo: hello from session B");

    await app.close();
  });

  /* ----- 2. Three parallel sessions to stress the in-memory Map ---------- */

  it("three parallel sessions don't cross-contaminate", async () => {
    const { app, inject, authFetch } = await setupAuthedApp();

    const ids = ["stress-1", "stress-2", "stress-3"];
    const results = await Promise.all(
      ids.map((id) =>
        inject({
          method: "POST",
          url: "/api/chat",
          payload: { content: `msg for ${id}`, sessionId: id },
        }),
      ),
    );

    for (let i = 0; i < ids.length; i++) {
      expect(results[i].statusCode).toBe(200);
      const events = parseSSE(results[i].body);
      expect(tokensToString(events)).toBe(`Echo: msg for ${ids[i]}`);
    }

    // Verify all histories
    for (const id of ids) {
      const hist = await inject({ method: "GET", url: `/api/sessions/${id}/messages` });
      const msgs = (JSON.parse(hist.body) as { messages: { role: string; content: string }[] }).messages;
      expect(msgs).toHaveLength(2);
      expect(msgs[0].content).toBe(`msg for ${id}`);
      expect(msgs[1].content).toBe(`Echo: msg for ${id}`);
    }

    await app.close();
  });

  /* ----- 3. Multi-turn within one session while another is in-flight ----- */

  it("multi-turn on one session does not interfere with parallel session", async () => {
    const { app, inject, authFetch } = await setupAuthedApp();

    // First turn for session X
    const r1 = await inject({
      method: "POST",
      url: "/api/chat",
      payload: { content: "first message", sessionId: "multi-x" },
    });
    expect(r1.statusCode).toBe(200);

    // Second turn for X in parallel with first turn for Y
    const [r2, rY] = await Promise.all([
      inject({
        method: "POST",
        url: "/api/chat",
        payload: { content: "second message", sessionId: "multi-x" },
      }),
      inject({
        method: "POST",
        url: "/api/chat",
        payload: { content: "only message", sessionId: "multi-y" },
      }),
    ]);

    expect(r2.statusCode).toBe(200);
    expect(rY.statusCode).toBe(200);

    // Session X should have 2 turns (4 messages: 2 user + 2 assistant)
    const histX = await inject({ method: "GET", url: "/api/sessions/multi-x/messages" });
    const msgsX = (JSON.parse(histX.body) as { messages: { role: string; content: string }[] }).messages;
    expect(msgsX).toHaveLength(4);
    expect(msgsX[0].content).toBe("first message");
    expect(msgsX[1].content).toBe("Echo: first message");
    expect(msgsX[2].content).toBe("second message");
    expect(msgsX[3].content).toBe("Echo: second message");

    // Session Y should have 1 turn (2 messages)
    const histY = await inject({ method: "GET", url: "/api/sessions/multi-y/messages" });
    const msgsY = (JSON.parse(histY.body) as { messages: { role: string; content: string }[] }).messages;
    expect(msgsY).toHaveLength(2);
    expect(msgsY[0].content).toBe("only message");
    expect(msgsY[1].content).toBe("Echo: only message");

    await app.close();
  });

  /* ----- 4. Client disconnect mid-stream — history still saved ----------- */

  it("history is saved even when client disconnects mid-stream", async () => {
    const { app, inject, authFetch } = await setupAuthedApp();

    // Need a real listening server for the disconnect test
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const controller = new AbortController();

    // Start a real fetch to the chat endpoint
    const response = await authFetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "disconnect me",
        sessionId: "disco-session",
      }),
      signal: controller.signal,
    });

    const reader = response.body!.getReader();

    // Read at least one chunk to make sure streaming has started
    const firstChunk = await reader.read();
    expect(firstChunk.done).toBe(false);

    // Abort the client connection
    controller.abort();

    // Give the gateway time to finish reading the Ollama stream and save history
    // (mock Ollama streams ~5 tokens × 80ms = ~400ms, add generous margin)
    await sleep(1500);

    // Verify the history was saved despite the client disconnect
    const hist = await inject({
      method: "GET",
      url: "/api/sessions/disco-session/messages",
    });
    const msgs = (JSON.parse(hist.body) as { messages: { role: string; content: string }[] }).messages;

    expect(msgs.length).toBeGreaterThanOrEqual(2);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toBe("disconnect me");
    expect(msgs[1].role).toBe("assistant");
    expect(msgs[1].content).toBe("Echo: disconnect me");

    await app.close();
  });

  /* ----- 5. Done event contains correct session_id & prompt_count -------- */

  it("done event contains correct session_id and prompt_count", async () => {
    const { app, inject, authFetch } = await setupAuthedApp();

    const res = await inject({
      method: "POST",
      url: "/api/chat",
      payload: { content: "count test", sessionId: "count-session" },
    });

    const events = parseSSE(res.body);
    const doneEvent = events.find((e) => e.type === "done");

    expect(doneEvent).toBeDefined();
    expect(doneEvent!.session_id).toBe("count-session");
    expect(doneEvent!.prompt_count).toBe(1);

    // Send a second message
    const res2 = await inject({
      method: "POST",
      url: "/api/chat",
      payload: { content: "second count test", sessionId: "count-session" },
    });

    const events2 = parseSSE(res2.body);
    const doneEvent2 = events2.find((e) => e.type === "done");
    expect(doneEvent2!.prompt_count).toBe(2);

    await app.close();
  });

  /* ----- 6. Mid-stream: messages endpoint returns partial assistant ------ */

  it("messages endpoint returns assistant message during active streaming", async () => {
    // Slow mock Ollama: "Echo: slow streaming test here" = 5 words × 400ms = 2s
    const slowOllama = await startMockOllama(400);
    const slowAddr = slowOllama.address() as AddressInfo;

    const config = {
      ...testConfig(),
      ollamaUrl: `http://127.0.0.1:${slowAddr.port}`,
    };
    const app = await createServer(config);
    const token = await signAuthToken({ id: "parallel-user", username: "parallel" }, config.jwtSecret);
    const authHeaders = { authorization: `Bearer ${token}` };
    const inject = (options: Parameters<typeof app.inject>[0]) => app.inject({
      ...options,
      headers: {
        ...authHeaders,
        ...(("headers" in options && options.headers) ? options.headers : {}),
      },
    });
    const authFetch: typeof fetch = (input, init) => fetch(input, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    // Start streaming (don't await — let it proceed in background)
    const streamPromise = authFetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "slow streaming test here",
        sessionId: "midstream-sess",
      }),
    });

    // Wait long enough for ~2 tokens to arrive, but stream is still going
    await sleep(900);

    // Query messages while stream is in progress
    const hist = await inject({
      method: "GET",
      url: "/api/sessions/midstream-sess/messages",
    });
    const msgs = (JSON.parse(hist.body) as {
      messages: { role: string; content: string }[];
    }).messages;

    // BUG 1: assistant message must exist mid-stream (even with partial content)
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toBe("slow streaming test here");
    expect(msgs[1].role).toBe("assistant");
    expect(msgs[1].content.length).toBeGreaterThan(0);

    // Let the stream finish, then verify the final state
    const response = await streamPromise;
    await response.text();

    const histFinal = await inject({
      method: "GET",
      url: "/api/sessions/midstream-sess/messages",
    });
    const msgsFinal = (JSON.parse(histFinal.body) as {
      messages: { role: string; content: string }[];
    }).messages;
    expect(msgsFinal[1].content).toBe("Echo: slow streaming test here");

    await new Promise<void>((r) => slowOllama.close(() => r()));
    await app.close();
  });

  /* ----- 7. Session switch then switch back shows completed history ------ */

  it("switching away and back after stream completes loads full history", async () => {
    const slowOllama = await startMockOllama(300);
    const slowAddr = slowOllama.address() as AddressInfo;

    const config = {
      ...testConfig(),
      ollamaUrl: `http://127.0.0.1:${slowAddr.port}`,
    };
    const app = await createServer(config);
    const token = await signAuthToken({ id: "parallel-user", username: "parallel" }, config.jwtSecret);
    const authHeaders = { authorization: `Bearer ${token}` };
    const inject = (options: Parameters<typeof app.inject>[0]) => app.inject({
      ...options,
      headers: {
        ...authHeaders,
        ...(("headers" in options && options.headers) ? options.headers : {}),
      },
    });
    const authFetch: typeof fetch = (input, init) => fetch(input, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    // Start streaming to session A
    const controllerA = new AbortController();
    const fetchA = authFetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "message for A",
        sessionId: "switch-a",
      }),
      signal: controllerA.signal,
    });

    // Wait for first token, then "switch away" (abort the client)
    const resA = await fetchA.then((r) => r);
    const readerA = resA.body!.getReader();
    await readerA.read(); // first chunk
    controllerA.abort();

    // Meanwhile, complete a message on session B
    const resB = await authFetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "message for B",
        sessionId: "switch-b",
      }),
    });
    await resB.text();

    // Wait for session A's stream to finish in the background
    await sleep(2500);

    // "Switch back" to session A — simulate reload/refetch
    const histA = await inject({
      method: "GET",
      url: "/api/sessions/switch-a/messages",
    });
    const msgsA = (JSON.parse(histA.body) as {
      messages: { role: string; content: string }[];
    }).messages;

    expect(msgsA).toHaveLength(2);
    expect(msgsA[0].content).toBe("message for A");
    expect(msgsA[1].role).toBe("assistant");
    expect(msgsA[1].content).toBe("Echo: message for A");

    // Session B also correct
    const histB = await inject({
      method: "GET",
      url: "/api/sessions/switch-b/messages",
    });
    const msgsB = (JSON.parse(histB.body) as {
      messages: { role: string; content: string }[];
    }).messages;
    expect(msgsB).toHaveLength(2);
    expect(msgsB[0].content).toBe("message for B");

    await new Promise<void>((r) => slowOllama.close(() => r()));
    await app.close();
  });

  /* ----- 8. Omitted sessionId creates orphaned messages (bug 2 doc) ------ */

  it("omitting sessionId orphans messages under a random id", async () => {
    const { app, inject, authFetch } = await setupAuthedApp();

    // Send message without sessionId (mimics client stale-closure bug)
    const res = await inject({
      method: "POST",
      url: "/api/chat",
      payload: { content: "orphan me" },
    });
    expect(res.statusCode).toBe(200);

    // The done event reveals the generated session_id
    const events = parseSSE(res.body);
    const doneEvent = events.find((e) => e.type === "done");
    const assignedId = doneEvent!.session_id as string;

    // Messages are under the random id
    const hist1 = await inject({
      method: "GET",
      url: `/api/sessions/${assignedId}/messages`,
    });
    expect(
      (JSON.parse(hist1.body) as { messages: unknown[] }).messages,
    ).toHaveLength(2);

    // But NOT under any "intended" session id
    const hist2 = await inject({
      method: "GET",
      url: "/api/sessions/my-intended-session/messages",
    });
    expect(
      (JSON.parse(hist2.body) as { messages: unknown[] }).messages,
    ).toHaveLength(0);

    await app.close();
  });

  /* ----- 9. SSE stream resume: reconnecting client gets live tokens ------- */

  it("GET /stream SSE endpoint delivers snapshot then live tokens until done", async () => {
    // Slow mock: "Echo: streaming resume test here" = 6 words × 300ms = 1.8s
    const slowOllama = await startMockOllama(300);
    const slowAddr = slowOllama.address() as AddressInfo;

    const config = {
      ...testConfig(),
      ollamaUrl: `http://127.0.0.1:${slowAddr.port}`,
    };
    const app = await createServer(config);
    const token = await signAuthToken({ id: "parallel-user", username: "parallel" }, config.jwtSecret);
    const authHeaders = { authorization: `Bearer ${token}` };
    const inject = (options: Parameters<typeof app.inject>[0]) => app.inject({
      ...options,
      headers: {
        ...authHeaders,
        ...(("headers" in options && options.headers) ? options.headers : {}),
      },
    });
    const authFetch: typeof fetch = (input, init) => fetch(input, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    // Start the original chat stream (don't await)
    const chatPromise = authFetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "streaming resume test here",
        sessionId: "sse-resume",
      }),
    });

    // Wait for a couple of tokens to arrive (~700ms → ~2 tokens)
    await sleep(700);

    // Connect to the stream-resume SSE endpoint
    const streamRes = await authFetch(`${baseUrl}/api/sessions/sse-resume/stream`);
    expect(streamRes.status).toBe(200);
    expect(streamRes.headers.get("content-type")).toContain("text/event-stream");

    const reader = streamRes.body!.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = "";
    const events: Record<string, unknown>[] = [];

    // Read all SSE events until the stream closes
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      sseBuffer += decoder.decode(value, { stream: true });
      const lines = sseBuffer.split("\n");
      sseBuffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          events.push(JSON.parse(line.slice(6)) as Record<string, unknown>);
        }
      }
    }

    // First event must be a snapshot with existing messages
    const snapshot = events[0];
    expect(snapshot.type).toBe("snapshot");
    expect(snapshot.streaming).toBe(true);
    const snapMsgs = snapshot.messages as { role: string; content: string }[];
    expect(snapMsgs.length).toBe(2); // user + partial assistant
    expect(snapMsgs[0].role).toBe("user");
    expect(snapMsgs[0].content).toBe("streaming resume test here");
    expect(snapMsgs[1].role).toBe("assistant");
    expect(snapMsgs[1].content.length).toBeGreaterThan(0); // has partial content

    // Should have received live token events after the snapshot
    const tokenEvents = events.filter((e) => e.type === "token");
    expect(tokenEvents.length).toBeGreaterThan(0);

    // Must end with a done event
    const lastEvent = events[events.length - 1];
    expect(lastEvent.type).toBe("done");
    expect(lastEvent.session_id).toBe("sse-resume");

    // Concatenate snapshot's partial content + live tokens = full response
    const snapshotContent = snapMsgs[1].content;
    const liveTokens = tokenEvents.map((e) => e.content as string).join("");
    expect(snapshotContent + liveTokens).toBe("Echo: streaming resume test here");

    // Clean up
    const chatRes = await chatPromise;
    await chatRes.text();
    await new Promise<void>((r) => slowOllama.close(() => r()));
    await app.close();
  });

  /* ----- 10. Stream endpoint on inactive session returns snapshot+done ---- */

  it("GET /stream on finished session returns snapshot and immediate done", async () => {
    const { app, inject, authFetch } = await setupAuthedApp();

    // Complete a chat first
    const chatRes = await inject({
      method: "POST",
      url: "/api/chat",
      payload: { content: "finished message", sessionId: "finished-sess" },
    });
    expect(chatRes.statusCode).toBe(200);

    // Now connect to the stream endpoint — should get snapshot + done immediately
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    const streamRes = await authFetch(`${baseUrl}/api/sessions/finished-sess/stream`);
    const body = await streamRes.text();
    const events = body
      .split("\n")
      .filter((l) => l.startsWith("data: "))
      .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("snapshot");
    expect(events[0].streaming).toBe(false);
    const msgs = events[0].messages as { role: string; content: string }[];
    expect(msgs).toHaveLength(2);
    expect(msgs[1].content).toBe("Echo: finished message");

    expect(events[1].type).toBe("done");

    await app.close();
  });

  /* ----- 11. Cancel endpoint aborts active Ollama stream ----------------- */

  it("POST /cancel aborts the Ollama stream and saves partial content", async () => {
    // Slow mock: "Echo: cancel me during streaming" = 6 words × 400ms = 2.4s
    const slowOllama = await startMockOllama(400);
    const slowAddr = slowOllama.address() as AddressInfo;

    const config = {
      ...testConfig(),
      ollamaUrl: `http://127.0.0.1:${slowAddr.port}`,
    };
    const app = await createServer(config);
    const token = await signAuthToken({ id: "parallel-user", username: "parallel" }, config.jwtSecret);
    const authHeaders = { authorization: `Bearer ${token}` };
    const inject = (options: Parameters<typeof app.inject>[0]) => app.inject({
      ...options,
      headers: {
        ...authHeaders,
        ...(("headers" in options && options.headers) ? options.headers : {}),
      },
    });
    const authFetch: typeof fetch = (input, init) => fetch(input, {
      ...init,
      headers: {
        ...authHeaders,
        ...(init?.headers ?? {}),
      },
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${addr.port}`;

    // Start a slow chat stream (don't await)
    const chatPromise = authFetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: "cancel me during streaming",
        sessionId: "cancel-sess",
      }),
    });

    // Wait for ~2 tokens to arrive
    await sleep(900);

    // Call the cancel endpoint
    const cancelRes = await authFetch(`${baseUrl}/api/sessions/cancel-sess/cancel`, {
      method: "POST",
    });
    expect(cancelRes.status).toBe(200);
    const cancelBody = await cancelRes.json() as { ok: boolean; cancelled: boolean };
    expect(cancelBody.ok).toBe(true);
    expect(cancelBody.cancelled).toBe(true);

    // Wait a bit for cleanup
    await sleep(300);

    // Check that the history has partial content saved (not empty, not full)
    const hist = await inject({
      method: "GET",
      url: "/api/sessions/cancel-sess/messages",
    });
    const data = JSON.parse(hist.body) as {
      sessionId: string;
      streaming: boolean;
      messages: { role: string; content: string }[];
    };

    expect(data.streaming).toBe(false); // no longer streaming
    expect(data.messages).toHaveLength(2);
    expect(data.messages[0].role).toBe("user");
    expect(data.messages[1].role).toBe("assistant");
    // Partial content: more than empty but less than full response
    expect(data.messages[1].content.length).toBeGreaterThan(0);
    expect(data.messages[1].content.length).toBeLessThan(
      "Echo: cancel me during streaming".length,
    );

    // Cancelling again should return cancelled: false (no active stream)
    const cancel2 = await authFetch(`${baseUrl}/api/sessions/cancel-sess/cancel`, {
      method: "POST",
    });
    const cancel2Body = await cancel2.json() as { ok: boolean; cancelled: boolean };
    expect(cancel2Body.cancelled).toBe(false);

    // Clean up the original fetch
    try { await chatPromise.then((r) => r.text()); } catch { /* aborted */ }
    await new Promise<void>((r) => slowOllama.close(() => r()));
    await app.close();
  });

  /* ----- 12. Burst/soak baseline across many concurrent sessions --------- */

  it("handles a burst of concurrent sessions without cross-session bleed", async () => {
    const { app, inject } = await setupAuthedApp();

    const sessionIds = Array.from({ length: 12 }, (_, i) => `burst-${i + 1}`);

    const responses = await Promise.all(
      sessionIds.map((sessionId) =>
        inject({
          method: "POST",
          url: "/api/chat",
          payload: { content: `payload for ${sessionId}`, sessionId },
        })
      ),
    );

    for (const res of responses) {
      expect(res.statusCode).toBe(200);
      const events = parseSSE(res.body);
      expect(events.some((e) => e.type === "done")).toBe(true);
    }

    const histories = await Promise.all(
      sessionIds.map((sessionId) =>
        inject({ method: "GET", url: `/api/sessions/${sessionId}/messages` })
      ),
    );

    histories.forEach((hist, idx) => {
      const sessionId = sessionIds[idx]!;
      const msgs = (JSON.parse(hist.body) as { messages: { role: string; content: string }[] }).messages;
      expect(msgs).toHaveLength(2);
      expect(msgs[0]?.content).toBe(`payload for ${sessionId}`);
      expect(msgs[1]?.content).toBe(`Echo: payload for ${sessionId}`);
    });

    await app.close();
  });

});
