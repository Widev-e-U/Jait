import { afterEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { messages } from "../db/schema.js";
import { SessionService } from "../services/sessions.js";
import { SessionStateService } from "../services/session-state.js";
import { UserService } from "../services/users.js";
import { createChatControlTool } from "./chat-control-tool.js";
import { ASK_MODE_TOOLS, MUTATING_TOOLS } from "./chat-modes.js";

const config = { ...loadConfig(), host: "0.0.0.0", port: 43_123, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", jwtSecret: "chat-control-test-secret" };
afterEach(() => vi.unstubAllGlobals());

async function setup() {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const userService = new UserService(db), sessionService = new SessionService(db), sessionState = new SessionStateService(db);
  const user = userService.createUser("chat-control-test", "password123");
  userService.updateSettings(user.id, { jaitBackend: "openrouter", apiKeys: { OPENROUTER_API_KEY: "fixture" } });
  const origin = sessionService.create({ userId: user.id, name: "Origin" });
  const target = sessionService.create({ userId: user.id, name: "Target" });
  sessionState.set(target.id, { "chat.provider": "jait", "chat.cliModels": { jait: "openai/gpt-4o" } });
  let release = () => {};
  const done = new Promise<void>(resolve => { release = resolve; });
  const requests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_input: unknown, init: RequestInit) => {
    requests.push(String(init.body));
    const encoder = new TextEncoder();
    return new Response(new ReadableStream({ async start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"working"},"finish_reason":null}]}\n\n'));
      await done;
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));
      controller.close();
    } }), { headers: { "Content-Type": "text/event-stream" } });
  }));
  const app = await createServer(config, { db, sqlite, userService, sessionService, sessionStateService: sessionState });
  const chatOrigins: string[] = [];
  app.addHook("onRequest", async (request) => {
    if (request.method === "POST" && request.url === "/api/chat") {
      chatOrigins.push(`${request.protocol}://${request.headers.host}`);
    }
  });
  const tool = createChatControlTool({ sessionService, sessionState, userService, config, getApp: () => app });
  const context = { userId: user.id, sessionId: origin.id, actionId: "test", requestedBy: "test" };
  const run = (input: Record<string, unknown>) => tool.execute({ sessionId: target.id, ...input }, context);
  return { db, sqlite, app, user, origin, target, sessionState, requests, chatOrigins, release, run, tool, context, userService, sessionService };
}

describe("chat.control", () => {
  it("requires plan approval and is unavailable in read-only ask mode", () => {
    expect(MUTATING_TOOLS.has("chat.control")).toBe(true);
    expect(ASK_MODE_TOOLS.has("chat.control")).toBe(false);
  });

  it("sends, queues, steers and stops another chat through the real chat routes", async () => {
    const env = await setup();
    try {
      expect((await env.run({ action: "status" })).data).toMatchObject({ running: false });
      const sent = await env.run({ action: "send", message: "First task" });
      expect(sent.ok, sent.message).toBe(true);
      expect(sent.data).toMatchObject({ accepted: true, queued: false, href: `/chat?sessionId=${env.target.id}` });
      await vi.waitFor(() => expect(env.requests.length).toBeGreaterThan(0));
      expect(env.requests[0]).toContain("openai/gpt-4o");
      expect(env.chatOrigins).toEqual(["http://127.0.0.1:43123"]);

      const busySend = await env.run({ action: "send", message: "Second task" });
      expect(busySend.ok).toBe(false);
      expect(busySend.message).toContain("steer");

      const queued = await env.run({ action: "queue", message: "Second task" });
      expect(queued.ok, queued.message).toBe(true);
      expect(queued.data).toMatchObject({ accepted: true, queued: true });
      const status = await env.run({ action: "status" });
      expect(status.data).toMatchObject({ running: true, queued: [{ content: "Second task" }] });

      const steered = await env.run({ action: "steer", message: "Focus on tests" });
      expect(steered.ok, steered.message).toBe(true);

      const stopped = await env.run({ action: "stop" });
      expect(stopped.ok, stopped.message).toBe(true);
      expect(stopped.data).toMatchObject({ cancelled: true });
      env.release();
      // Stopping the turn drains the queued message into a new turn.
      await vi.waitFor(async () => {
        const rows = env.db.select().from(messages).where(eq(messages.sessionId, env.target.id)).all();
        expect(rows.filter(row => row.role === "user").map(row => row.content)).toEqual(["First task", "Second task"]);
        expect((await env.run({ action: "status" })).data).toMatchObject({ running: false, queued: [] });
      }, { timeout: 5000 });
      expect(env.chatOrigins).toEqual(Array<string>(3).fill("http://127.0.0.1:43123"));
      expect(env.db.select().from(messages).where(eq(messages.sessionId, env.origin.id)).all()).toHaveLength(0);
    } finally {
      env.release();
      await env.app.close();
      env.sqlite.close();
    }
  });

  it("refuses the current chat, other users' chats, idle steering and chats without a provider", async () => {
    const env = await setup();
    try {
      expect((await env.tool.execute({ action: "stop", sessionId: env.origin.id }, env.context)).message).toContain("current chat");
      const other = env.userService.createUser("chat-control-other", "password123");
      const foreign = env.sessionService.create({ userId: other.id, name: "Foreign" });
      expect((await env.tool.execute({ action: "send", sessionId: foreign.id, message: "hi" }, env.context)).message).toContain("not found");
      const steer = await env.run({ action: "steer", message: "hi" });
      expect(steer.ok).toBe(false);
      expect(steer.message).toContain("409");
      const bare = env.sessionService.create({ userId: env.user.id, name: "Bare" });
      const unselected = await env.tool.execute({ action: "queue", sessionId: bare.id, message: "hi" }, env.context);
      expect(unselected.ok).toBe(false);
      expect(unselected.message).toContain("provider");
      expect(env.requests).toHaveLength(0);
    } finally {
      env.release();
      await env.app.close();
      env.sqlite.close();
    }
  });
});
