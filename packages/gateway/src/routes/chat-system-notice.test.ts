import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { SessionService } from "../services/sessions.js";
import { UserService } from "../services/users.js";
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

function startMockOllama(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method !== "POST" || !req.url?.endsWith("/api/chat")) {
        res.writeHead(404);
        res.end();
        return;
      }
      await collectBody(req);
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

  afterAll(async () => {
    await new Promise<void>((resolve) => mockOllama.close(() => resolve()));
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
    const userService = new UserService(db);
    const user = userService.createUser("sys-notice-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Sys Notice" });

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      userService,
    });

    const token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);
    const fullNotification = "[system-notification: background command finished]\nA background terminal command finished.";
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
    const userService = new UserService(db);
    const user = userService.createUser("sys-notice-user-2", "password123");
    const session = sessionService.create({ userId: user.id, name: "Sys Notice 2" });

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
