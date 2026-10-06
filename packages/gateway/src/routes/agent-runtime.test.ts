import { describe, expect, it } from "vitest";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { SessionService } from "../services/sessions.js";
import { SessionStateService } from "../services/session-state.js";
import { ThreadService } from "../services/threads.js";
import { UserService } from "../services/users.js";
import { ProviderRegistry } from "../providers/registry.js";
import { signAuthToken } from "../security/http-auth.js";
import { __chatTestUtils } from "./chat.js";

const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };

describe("agent runtime snapshots", () => {
  it("uses durable timestamps, ignores metadata updates, and enforces ownership", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const threadService = new ThreadService(db);
    const user = userService.createUser("runtime-user", "password123");
    const other = userService.createUser("runtime-other", "password123");
    const session = sessionService.create({ userId: user.id });
    const thread = threadService.create({ userId: user.id, title: "Task", providerId: "codex" });
    const startedAt = "2026-09-30T12:00:00.000Z";
    sessionState.set(session.id, { "chat.activeTurn": { turnId: "turn-1", startedAt, mode: "agent", provider: "codex" } });
    const old = threadService.addActivity(thread.id, "message", "old turn", { role: "user", content: "old" });
    sqlite.prepare("UPDATE agent_thread_activities SET created_at = ? WHERE id = ?").run("2026-09-29T12:00:00.000Z", old.id);
    const current = threadService.addActivity(thread.id, "message", "current turn", { role: "user", content: "current" });
    sqlite.prepare("UPDATE agent_thread_activities SET created_at = ? WHERE id = ?").run(startedAt, current.id);
    threadService.addActivity(thread.id, "message", "assistant reply", { role: "assistant" });
    threadService.addActivity(thread.id, "tool.result", "newer activity", { output: "result" });
    threadService.markRunning(thread.id, "provider-session");
    threadService.update(thread.id, { title: "Renamed while working" });
    const app = await createServer(config, { db, sqlite, userService, sessionService, sessionState, threadService, providerRegistry: new ProviderRegistry() });
    const headers = { authorization: `Bearer ${await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret)}` };
    const otherHeaders = { authorization: `Bearer ${await signAuthToken({ id: other.id, username: other.username }, config.jwtSecret)}` };
    threadService.savePersonaAgent(user.id, { id: "profile", name: "Runtime agent", chatSessionId: session.id, chatThreadId: thread.id, activeTasks: 900, liveState: "running" });
    expect(threadService.getPersonaAgent("profile", user.id)).not.toHaveProperty("activeTasks");
    __chatTestUtils.activeStreams.add(session.id);
    try {
      for (const url of [`/api/sessions/${session.id}/runtime`, `/api/threads/${thread.id}/runtime`]) {
        expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
        expect((await app.inject({ method: "GET", url, headers: otherHeaders })).statusCode).toBe(404);
        const response = await app.inject({ method: "GET", url, headers });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ running: true, startedAt });
      }
      // A bound session streaming without this persona must not count toward it.
      const readProfiles = async () => (await app.inject({ method: "GET", url: "/api/persona-agents", headers })).json().agents;
      expect(await readProfiles()).toEqual([expect.objectContaining({ id: "profile", activeTasks: 1, liveState: "running" })]);
      expect((await app.inject({ method: "GET", url: "/api/persona-agents", headers: otherHeaders })).json().agents).toEqual([]);
      threadService.addActivity(thread.id, "tool.approval", "Approval required", { requestId: "approval-one", tool: "terminal.run" });
      expect(await readProfiles()).toEqual([expect.objectContaining({ activeTasks: 1, liveState: "waiting" })]);
      // An unrelated result cannot clear this approval.
      threadService.addActivity(thread.id, "tool.result", "Other tool finished", { tool: "file.read" });
      expect(await readProfiles()).toEqual([expect.objectContaining({ liveState: "waiting" })]);
      threadService.addActivity(thread.id, "tool.approval-response", "Tool approved", { requestId: "approval-one", approved: true });
      expect(await readProfiles()).toEqual([expect.objectContaining({ liveState: "running" })]);
      __chatTestUtils.activeStreams.delete(session.id);
      // A stale durable marker alone must not show a stopped chat as working.
      expect((await app.inject({ method: "GET", url: `/api/sessions/${session.id}/runtime`, headers })).json()).toEqual({ running: false, startedAt: null });
      threadService.markInterrupted(thread.id);
      expect(await readProfiles()).toEqual([expect.objectContaining({ activeTasks: 0, liveState: "idle" })]);
      expect((await app.inject({ method: "GET", url: `/api/threads/${thread.id}/runtime`, headers })).json()).toEqual({ running: false, startedAt: null });
    } finally {
      __chatTestUtils.activeStreams.delete(session.id);
      await app.close();
      sqlite.close();
    }
  });
});
