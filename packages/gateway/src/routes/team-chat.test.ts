import { EventEmitter } from "node:events";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { createServer } from "../server.js";
import { loadConfig } from "../config.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { UserService } from "../services/users.js";
import { SessionService } from "../services/sessions.js";
import { ThreadService } from "../services/threads.js";
import { ProviderRegistry } from "../providers/registry.js";
import { ToolRegistry } from "../tools/registry.js";
import { signAuthToken } from "../security/http-auth.js";
import { personaAgentProfileSchema } from "@jait/shared";
import type { CliProviderAdapter, ProviderEvent, ProviderSession, StartSessionOptions } from "../providers/contracts.js";

class TeamProvider implements CliProviderAdapter {
  readonly id = "codex" as const;
  readonly info = { id: this.id, name: "Test", description: "Test", available: true, modes: ["full-access", "supervised"] as ("full-access" | "supervised")[] };
  private events = new EventEmitter();
  startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "provider-" + options.threadId, providerId: this.id, threadId: options.threadId,
    status: "running", runtimeMode: options.mode, startedAt: new Date().toISOString(),
  }));
  sendTurn = vi.fn(async (sessionId: string, _content: string) => {
    setTimeout(() => {
      this.events.emit("event", { type: "token", sessionId, content: "Work checked and ready." });
      this.events.emit("event", { type: "turn.completed", sessionId });
    }, 0);
  });
  stopSession = vi.fn(async () => {});
  checkAvailability = async () => true;
  respondToApproval = async () => {};
  onEvent(handler: (event: ProviderEvent) => void) {
    this.events.on("event", handler); return () => this.events.off("event", handler);
  }
}

describe("team room routes and work chat integration", () => {
  let opened: Awaited<ReturnType<typeof openDatabase>>;
  let app: Awaited<ReturnType<typeof createServer>>;
  let users: UserService;
  let sessions: SessionService;
  let user: ReturnType<UserService["createUser"]>;
  let headers: { authorization: string };
  let provider: TeamProvider;
  let registry: ToolRegistry;
  let roomId: string;
  const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };

  beforeEach(async () => {
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    users = new UserService(opened.db); sessions = new SessionService(opened.db);
    user = users.createUser("Jakob", "test-password");
    headers = { authorization: "Bearer " + await signAuthToken(user, config.jwtSecret) };
    const profiles = new ThreadService(opened.db);
    for (const id of ["Scrum", "Developer", "QA"]) profiles.savePersonaAgent(user.id, personaAgentProfileSchema.parse({
      id, name: id, persona: "Persona for " + id, role: id, reportsToId: id === "Scrum" ? null : "Scrum",
      avatar: "Nova", providerId: "codex", model: "saved-model", requiresApproval: true, paused: false,
      repositoryIds: [], skillIds: [], allowedTools: [], schedule: { kind: "adaptive", rules: "" },
      notificationChannels: [], notificationEvents: [],
    }));
    provider = new TeamProvider();
    const providers = new ProviderRegistry(); providers.register(provider);
    registry = new ToolRegistry();
    app = await createServer(config, { db: opened.db, userService: users, sessionService: sessions,
      threadService: profiles, providerRegistry: providers, toolRegistry: registry });
    await app.ready();
    const created = await app.inject({ method: "POST", url: "/api/team-rooms", headers, payload: { agentId: "Developer" } });
    expect(created.statusCode).toBe(200); roomId = created.json().room.id;
  });
  afterEach(async () => { await app.close(); opened.sqlite.close(); });
  const snapshot = async () => (await app.inject({ method: "GET", url: "/api/team-rooms/" + roomId, headers })).json();

  it("dispatches through the real chat route with identity, model and supervised settings, and persists results", async () => {
    const response = await app.inject({ method: "POST", url: "/api/team-rooms/" + roomId + "/messages", headers,
      payload: { content: "Check this ticket", recipientIds: ["Developer"], clientKey: "ticket" } });
    expect(response.statusCode).toBe(201);
    await vi.waitFor(async () => expect((await snapshot()).deliveries[0]?.status).toBe("completed"), { timeout: 10_000 });
    expect(provider.startSession.mock.calls[0]?.[0]).toMatchObject({ model: "saved-model", mode: "supervised" });
    expect(provider.sendTurn.mock.calls[0]?.[1]).toContain("Persona for Developer");
    expect(provider.sendTurn.mock.calls[0]?.[1]).toContain("team.chat");
    const state = await snapshot();
    expect(state.messages.at(-1)).toMatchObject({ kind: "result", content: "Work checked and ready.", sender: { kind: "agent", id: "Developer" } });
    const workId = state.deliveries[0].sessionId;
    expect(state.messages.at(-1).workSessionId).toBe(workId);
    // Repeating the request creates neither a second message nor work session.
    await app.inject({ method: "POST", url: "/api/team-rooms/" + roomId + "/messages", headers,
      payload: { content: "Check this ticket", recipientIds: ["Developer"], clientKey: "ticket" } });
    expect(provider.startSession).toHaveBeenCalledTimes(1);
    // A later handoff to the same conversation must surface its own result.
    await app.inject({ method: "POST", url: "/api/team-rooms/" + roomId + "/messages", headers,
      payload: { content: "Retest the change", recipientIds: ["Developer"], targetSessionId: workId, clientKey: "retest" } });
    await vi.waitFor(async () => expect((await snapshot()).deliveries.at(-1)?.status).toBe("completed"), { timeout: 10_000 });
    expect((await snapshot()).messages.filter((message: { kind: string }) => message.kind === "result")).toHaveLength(2);
  });

  it("relays as the actual named normal chat and rejects empty or foreign-chat messages", async () => {
    const source = sessions.create({ userId: user.id, name: "Developer Chat" });
    const tool = registry.get("team.chat")!;
    const context = { userId: user.id, sessionId: source.id, projectRoot: process.cwd(), actionId: "relay" };
    expect((await tool.execute({ action: "send", roomId, content: "Use the board", recipientIds: [] }, context)).ok).toBe(true);
    const state = await snapshot();
    expect(state.messages[0]).toMatchObject({ content: user.username + " said: Use the board", sender: { kind: "chat", name: "Developer Chat", avatar: null, sourceSessionId: source.id } });
    expect((await tool.execute({ action: "send", roomId, content: "" }, context)).ok).toBe(false);
    const privateChat = sessions.create({ userId: "another-user" });
    expect((await tool.execute({ action: "send", roomId, content: "Spoof" }, { ...context, sessionId: privateChat.id })).ok).toBe(false);
  });

  it("requires authentication and enforces room ownership and recipients", async () => {
    expect((await app.inject({ method: "GET", url: "/api/team-rooms" })).statusCode).toBe(401);
    const other = users.createUser("Other", "test-password");
    const otherHeaders = { authorization: "Bearer " + await signAuthToken(other, config.jwtSecret) };
    expect((await app.inject({ method: "GET", url: "/api/team-rooms/" + roomId, headers: otherHeaders })).statusCode).toBe(404);
    const bad = await app.inject({ method: "POST", url: "/api/team-rooms/" + roomId + "/messages", headers,
      payload: { content: "Bad target", clientKey: "invalid", recipientIds: ["foreign-agent"] } });
    expect(bad.statusCode).toBe(400);
    expect((await snapshot()).deliveries).toHaveLength(0);
  });
});
