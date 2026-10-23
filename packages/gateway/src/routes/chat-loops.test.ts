import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { SessionService } from "../services/sessions.js";
import { SessionStateService } from "../services/session-state.js";
import { UserService } from "../services/users.js";
import { ChatLoopService } from "../services/chat-loops.js";
import { sessionWaits } from "../services/session-waits.js";
import { WsControlPlane } from "../ws.js";
import { signAuthToken } from "../security/http-auth.js";
import { messages } from "../db/schema.js";
import { eq } from "drizzle-orm";

describe("chat loop automatic continuation", () => {
  let app: Awaited<ReturnType<typeof createServer>>;
  let mock: Server;
  let loops: ChatLoopService;
  let sessionId: string;
  let headers: { authorization: string };
  let otherHeaders: { authorization: string };
  let calls: Array<{ model?: string; messages: Array<{ role: string; content: string }> }>;
  let onTurn: () => void;
  let responseStatus: number;
  let closeDb: () => void;
  let state: SessionStateService;
  let reopen: () => Promise<Awaited<ReturnType<typeof createServer>>>;
  let publish: ReturnType<typeof vi.spyOn>;
  let readMessages: () => Array<{ role: string; content: string }>;

  beforeEach(async () => {
    calls = [];
    responseStatus = 200;
    onTurn = () => {};
    mock = createHttpServer(async (req, res) => {
      let body = "";
      for await (const chunk of req) body += chunk;
      calls.push(JSON.parse(body));
      if (responseStatus !== 200) {
        res.writeHead(responseStatus, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Test provider failed" } }));
        return;
      }
      onTurn();
      if (req.url?.endsWith("/api/chat")) {
        res.writeHead(200, { "Content-Type": "application/x-ndjson" });
        res.write(JSON.stringify({ message: { role: "assistant", content: "Progress recorded" }, done: false }) + "\n");
        res.end(JSON.stringify({ done: true, done_reason: "stop", prompt_eval_count: 1, eval_count: 1 }) + "\n");
      } else {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "Progress recorded" }, finish_reason: null }] })}\n\n`);
        res.end("data: [DONE]\n\n");
      }
    });
    await new Promise<void>(resolve => mock.listen(0, "127.0.0.1", resolve));
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    closeDb = () => sqlite.close();
    const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent" as const, nodeEnv: "test", llmProvider: "ollama" as const, ollamaUrl: `http://127.0.0.1:${(mock.address() as AddressInfo).port}`, jwtSecret: "loop-test-secret" };
    const sessions = new SessionService(db);
    const users = new UserService(db);
    const user = users.createUser("loop-owner", "password123");
    const otherUser = users.createUser("loop-other-owner", "password123");
    otherHeaders = { authorization: `Bearer ${await signAuthToken({ id: otherUser.id, username: otherUser.username }, config.jwtSecret)}` };
    const ws = new WsControlPlane(config, db);
    publish = vi.spyOn(ws, "publishChatNotification");
    loops = new ChatLoopService(sessions, ws);
    sessionId = sessions.create({ userId: user.id, name: "Fix goal" }).id;
    state = new SessionStateService(db);
    reopen = () => createServer(config, { db, sqlite, sessionService: sessions, sessionState: state, userService: users, ws, chatLoops: loops });
    app = await reopen();
    headers = { authorization: `Bearer ${await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)}` };
    readMessages = () => db.select().from(messages).where(eq(messages.sessionId, sessionId)).all();
    await app.ready();
  });
  afterEach(async () => {
    sessionWaits.clearSession(sessionId);
    await app.close();
    await new Promise<void>(resolve => mock.close(() => resolve()));
    closeDb();
  });

  it("runs hidden self-messages, checks progress and stops without completion notifications", async () => {
    onTurn = () => {
      const loop = loops.get(sessionId)!;
      loops.check(sessionId, calls.length === 1
        ? { revision: loop.revision, outcome: "continue", summary: "Fix prepared", nextMessage: "Run the regression test" }
        : { revision: loop.revision, outcome: "complete", summary: "Verified", evidence: ["Regression command exited 0"] });
    };
    loops.goal(sessionId, "Fix the bug", ["Regression passes"]);
    await vi.waitFor(() => expect(loops.get(sessionId)).toMatchObject({ status: "completed", iteration: 2 }), { timeout: 10000 });
    expect(calls).toHaveLength(2);
    expect(JSON.stringify(calls[1])).toContain("Run the regression test");
    expect(readMessages().filter(message => message.role === "user")).toHaveLength(0);
    expect(readMessages().filter(message => message.role === "assistant")).toHaveLength(2);
    expect(publish).not.toHaveBeenCalled();
  });

  it("restores a running loop after gateway startup without an open browser", async () => {
    loops.goal(sessionId, "Finish saved work", ["Check passes"]);
    await app.close();
    onTurn = () => loops.check(sessionId, { revision: loops.get(sessionId)!.revision, outcome: "complete", summary: "Verified", evidence: ["Check passed"] });
    app = await reopen();
    await app.ready();
    await vi.waitFor(() => expect(loops.get(sessionId)?.status).toBe("completed"), { timeout: 10000 });
    expect(calls).toHaveLength(1);
    expect(publish).not.toHaveBeenCalled();
  });

  it("preserves model selection without allowing saved UI state to retarget a continuation", async () => {
    state.set(sessionId, { "loop.turn-options": {
      turnId: "previous", startedAt: new Date().toISOString(), mode: "agent", responseStyle: "normal", model: "fixture-model",
      sessionId: "another-chat", _systemNotification: "Wrong hidden task",
    } });
    onTurn = () => loops.check(sessionId, { revision: loops.get(sessionId)!.revision, outcome: "complete", summary: "Verified", evidence: ["Check passed"] });
    loops.goal(sessionId, "Fix the authorized target", ["Pass"]);
    await vi.waitFor(() => expect(loops.get(sessionId)?.status).toBe("completed"), { timeout: 10000 });
    expect(calls[0]?.model).toBe("fixture-model");
    expect(JSON.stringify(calls[0])).toContain("Fix the authorized target");
    expect(JSON.stringify(calls[0])).not.toContain("Wrong hidden task");
  });

  it("restores ordinary notifications for new turns after goal completion", async () => {
    onTurn = () => {
      const loop = loops.get(sessionId)!;
      if (loop.status === "running") loops.check(sessionId, { revision: loop.revision, outcome: "complete", summary: "Verified", evidence: ["Passed"] });
    };
    loops.goal(sessionId, "Fix", ["Pass"]);
    await vi.waitFor(() => expect(loops.get(sessionId)?.iteration).toBe(1), { timeout: 10000 });
    expect(publish).not.toHaveBeenCalled();
    await app.inject({ method: "POST", url: "/api/chat", headers, payload: { sessionId, content: "Explain the result" } });
    await vi.waitFor(() => expect(publish).toHaveBeenCalled());
    expect(publish.mock.calls[0]?.[1]).toMatchObject({ kind: "completion", title: "Response ready · Fix goal" });
    expect(loops.get(sessionId)?.iteration).toBe(1);
  });

  it("cancel during the gap pauses continuation, and controls require ownership", async () => {
    loops.goal(sessionId, "Fix", ["Pass"]);
    expect((await app.inject({ method: "POST", url: `/api/sessions/${sessionId}/loop`, payload: { action: "pause" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: `/api/sessions/missing/loop`, headers, payload: { action: "resume" } })).statusCode).toBe(404);
    await app.inject({ method: "POST", url: `/api/sessions/${sessionId}/cancel`, headers });
    expect(loops.get(sessionId)?.status).toBe("paused");
    await new Promise(resolve => setTimeout(resolve, 350));
    expect(calls).toHaveLength(0);
    expect((await app.inject({ method: "GET", url: `/api/sessions/${sessionId}/loop`, headers })).json().loop.status).toBe("paused");
  });

  it("blocks on pending human input and wakes when the wait is cleared", async () => {
    sessionWaits.raise({ key: "loop-question", sessionId, kind: "question" });
    onTurn = () => loops.check(sessionId, { revision: loops.get(sessionId)!.revision, outcome: "complete", summary: "Verified", evidence: ["Check passed"] });
    loops.goal(sessionId, "Fix", ["Pass"]);
    await new Promise(resolve => setTimeout(resolve, 350));
    expect(calls).toHaveLength(0);
    sessionWaits.clear("loop-question");
    await vi.waitFor(() => expect(loops.get(sessionId)?.status).toBe("completed"), { timeout: 10000 });
    expect(calls).toHaveLength(1);
  });

  it("stops on provider errors and resumes only on request", async () => {
    responseStatus = 400;
    loops.goal(sessionId, "Fix", ["Pass"]);
    await vi.waitFor(() => expect(loops.get(sessionId)?.status).toBe("error"), { timeout: 10000 });
    expect(publish.mock.calls[0]?.[1]).toMatchObject({ kind: "attention", title: "Loop stopped" });
    await new Promise(resolve => setTimeout(resolve, 350));
    expect(calls).toHaveLength(1);
  });

  it("a direct answer resumes a waiting goal and validates owner access", async () => {
    const goal = loops.goal(sessionId, "Fix", ["Pass"]);
    loops.check(sessionId, { revision: goal.revision, outcome: "waiting", summary: "Which target?" });
    expect((await app.inject({ method: "GET", url: `/api/sessions/${sessionId}/loop`, headers: otherHeaders })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: `/api/sessions/${sessionId}/loop`, headers: otherHeaders, payload: { action: "resume" } })).statusCode).toBe(404);
    onTurn = () => {
      expect(loops.get(sessionId)?.status).toBe("running");
      loops.check(sessionId, { revision: loops.get(sessionId)!.revision, outcome: "complete", summary: "Verified", evidence: ["Regression passed"] });
    };
    const response = await app.inject({ method: "POST", url: "/api/chat", headers, payload: { sessionId, content: "Use the authorized lab target" } });
    expect(response.statusCode).toBe(200);
    await vi.waitFor(() => expect(loops.get(sessionId)?.iteration).toBe(1));
    expect(loops.get(sessionId)?.status).toBe("completed");
    expect(calls).toHaveLength(1);
  });

  it("waits for a user answer and sends attention instead of a completion notification", async () => {
    onTurn = () => loops.check(sessionId, { revision: loops.get(sessionId)!.revision, outcome: "waiting", summary: "Which network is authorized?" });
    loops.goal(sessionId, "Check the authorized network", ["Authorized checks pass"]);
    await vi.waitFor(() => expect(publish).toHaveBeenCalled(), { timeout: 10000 });
    expect(calls).toHaveLength(1);
    expect(publish.mock.calls[0]?.[1]).toMatchObject({ kind: "attention", title: "Loop needs your answer" });
    expect(loops.get(sessionId)?.status).toBe("waiting");
  });
});
