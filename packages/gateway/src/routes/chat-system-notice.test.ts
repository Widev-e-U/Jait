import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../server.js";
import { formatBackgroundCommandNotification } from "./chat.js";
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { SessionService } from "../services/sessions.js";
import { SessionStateService } from "../services/session-state.js";
import { UserService } from "../services/users.js";
import { backgroundCommandMonitor } from "../services/background-command-monitor.js";
import { signAuthToken } from "../security/http-auth.js";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

async function collectBody(req: IncomingMessage): Promise<string> {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
}

let holdResponse: (() => Promise<void>) | undefined;
const receivedBodies: Array<Record<string, unknown>> = [];

function startMockOllama(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== "POST" || !req.url?.endsWith("/api/chat")) {
        res.writeHead(404);
        res.end();
        return;
      }
      receivedBodies.push(JSON.parse(await collectBody(req)) as Record<string, unknown>);
      if (holdResponse) await holdResponse();
      res.writeHead(200, { "Content-Type": "application/x-ndjson" });
      res.write(JSON.stringify({ message: { role: "assistant", content: "acknowledged" }, done: false }) + "\n");
      res.write(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
      res.end();
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

describe("background-command system notice", () => {
  let mockOllama: Server;
  let ollamaUrl: string;
  let app: Awaited<ReturnType<typeof createServer>> | null = null;

  beforeAll(async () => {
    mockOllama = await startMockOllama();
    const address = mockOllama.address() as AddressInfo;
    ollamaUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  beforeEach(() => {
    receivedBodies.length = 0;
    holdResponse = undefined;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => mockOllama.close(() => resolve()));
  });

  it("delivers a completed command after an unsteerable active turn", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const,
      nodeEnv: "test", llmProvider: "ollama" as const, ollamaUrl, jwtSecret: "test-jwt-secret" };
    const sessionService = new SessionService(db);
    const userService = new UserService(db);
    const user = userService.createUser("queued-notice-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Queued notice" });
    new SessionStateService(db).set(session.id, { "chat.provider": "jait", "chat.cliModels": { jait: "llama3" } });
    app = await createServer(config, { db, sqlite, sessionService, userService });
    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    let release!: () => void;
    holdResponse = () => new Promise<void>(resolve => { release = resolve; });
    const first = app.inject({ method: "POST", url: "/api/chat", headers: { authorization: `Bearer ${token}` },
      payload: { sessionId: session.id, content: "do the work", provider: "jait", model: "llama3" } });
    await vi.waitFor(() => expect(release).toBeDefined());
    let listener: ((data: string) => void) | undefined;
    const surface = { addOutputListener: (fn: (data: string) => void) => { listener = fn; },
      removeOutputListener: () => {} };
    backgroundCommandMonitor.track({ sessionId: session.id, terminalId: "tty-test", command: "test-command", surface });
    listener!("result-marker\r\n\x1b]633;D;0\x07");
    await new Promise(resolve => setTimeout(resolve, 30));
    holdResponse = undefined;
    release();
    await first;
    await vi.waitFor(() => expect(receivedBodies.length).toBe(2));
    const messages = receivedBodies[1]!["messages"] as Array<{ content: string }>;
    expect(messages.some(message => message.content.includes("result-marker"))).toBe(true);
  });

  it("persists and surfaces a hidden system-notification turn as a visible gray system-notice", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
      jwtSecret: "test-jwt-secret",
    };

    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("sys-notice-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Sys Notice" });
    // Autonomous turns run only on the provider+model the user picked for this chat.
    sessionState.set(session.id, { "chat.provider": "jait", "chat.cliModels": { jait: "llama3" } });

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      userService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const fullNotification = formatBackgroundCommandNotification({
      sessionId: session.id,
      terminalId: "tty1",
      command: "bun run test",
      exitCode: 0,
      output: "tests passed",
      durationMs: 5_000,
    });
    const notice = "Background terminal #tty1 finished in ~5s (exit 0)";

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        sessionId: session.id,
        _systemNotification: fullNotification,
        _systemNotice: notice,
      },
    });
    expect(response.statusCode).toBe(200);

    // A continuation turn has no prompt text, so the browser cannot build a user
    // bubble from `content`. It renders the gray notice line instead and reads
    // its text from this event, so live view and reload agree.
    const requestEvent = response.body
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice("data: ".length)) as { type?: string; systemNotice?: boolean; noticeText?: string })
      .find((event) => event.type === "request");
    expect(requestEvent).toMatchObject({ systemNotice: true, noticeText: notice });

    const modelMessages = receivedBodies.at(-1)?.["messages"] as Array<{ role: string; content: string }>;
    expect(modelMessages.at(-1)).toMatchObject({
      role: "user",
      content: expect.stringContaining(fullNotification),
    });
    expect(modelMessages.at(-1)?.content).toContain("Always produce a user-visible final response");

    const messagesResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/messages`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(messagesResponse.statusCode).toBe(200);
    const body = messagesResponse.json() as { messages: Array<{ role: string; content: string; systemNotice?: boolean }> };

    // The short notice is persisted as a visible system row; the full (hidden)
    // notification must NOT leak into the UI.
    expect(body.messages.find((m) => m.role === "system")).toMatchObject({
      role: "system",
      content: notice,
      systemNotice: true,
    });
    expect(body.messages.some((m) => m.content.includes(fullNotification))).toBe(false);
  });

  it("does not surface a visible system notice when only a system notification is sent without a notice line", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl,
      jwtSecret: "test-jwt-secret",
    };

    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("sys-notice-user-2", "password123");
    const session = sessionService.create({ userId: user.id, name: "Sys Notice 2" });
    sessionState.set(session.id, { "chat.provider": "jait", "chat.cliModels": { jait: "llama3" } });

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      userService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        sessionId: session.id,
        _systemNotification: "[system-notification: background command finished]\nno notice line",
      },
    });
    expect(response.statusCode).toBe(200);

    const messagesResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/messages`,
      headers: { authorization: `Bearer ${token}` },
    });
    const body = messagesResponse.json() as { messages: Array<{ role: string }> };
    expect(body.messages.filter((m) => m.role === "system")).toHaveLength(0);
  });
});
