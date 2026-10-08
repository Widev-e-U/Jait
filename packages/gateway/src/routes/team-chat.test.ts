import { eq } from "drizzle-orm";
import { messages } from "../db/schema.js";
import { SessionStateService } from "../services/session-state.js";
import { __chatTestUtils, getPersonaChatRuntime } from "./chat.js";
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
  beforeSend?: () => void;
  private events = new EventEmitter();
  startSession = vi.fn(async (options: StartSessionOptions): Promise<ProviderSession> => ({
    id: "provider-" + options.threadId, providerId: this.id, threadId: options.threadId,
    status: "running", runtimeMode: options.mode, startedAt: new Date().toISOString(),
  }));
  sendTurn = vi.fn(async (sessionId: string, _content: string) => {
    this.beforeSend?.();
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
      threadService: profiles, providerRegistry: providers, toolRegistry: registry, sessionState: new SessionStateService(opened.db) });
    await app.ready();
    const created = await app.inject({ method: "POST", url: "/api/team-rooms", headers, payload: { agentId: "Developer", sourceSessionId: sessions.create({ userId: user.id, projectPath: "/tmp" }).id } });
    expect(created.statusCode).toBe(200); roomId = created.json().room.id;
  });
  afterEach(async () => { await app.close(); opened.sqlite.close(); });
  const snapshot = async () => (await app.inject({ method: "GET", url: "/api/team-rooms/" + roomId, headers })).json();

  it("automatically addresses role-matched team messages with shared-composer attachments", async () => {
    const response = await app.inject({ method: "POST", url: "/api/team-rooms/" + roomId + "/messages", headers,
      payload: { content: "Developer, implement the fix", clientKey: "automatic", attachments: [{ name: "notes.txt", mimeType: "text/plain", data: "bm90ZXM=" }] } });
    expect(response.statusCode).toBe(201);
    expect(response.json().message.recipientIds).toEqual(["Developer"]);
    expect(response.json().message.attachments[0].name).toBe("notes.txt");
  });

  it("selects an owned persona per ordinary-chat turn and snapshots attribution across edits and switches", async () => {
    const session = sessions.create({ userId: user.id, name: "Mixed identities" });
    const send = (id: string) => app.inject({ method: "POST", url: "/api/chat", headers,
      payload: { sessionId: session.id, content: "Check this", personaAgentId: id, provider: "jait", model: "wrong-model", runtimeMode: "full-access" } });
    const response = await send("Developer");
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"persona":{"id":"Developer"');
    expect(provider.startSession.mock.calls[0]?.[0]).toMatchObject({ model: "saved-model", mode: "supervised" });
    expect(provider.sendTurn.mock.calls[0]?.[1]).toContain("Persona for Developer");
    await send("Developer");
    expect(provider.startSession).toHaveBeenCalledTimes(1);
    await send("QA");
    expect(provider.startSession).toHaveBeenCalledTimes(2);
    expect(provider.sendTurn.mock.calls[2]?.[1]).toContain("Persona for QA");
    const profiles = new ThreadService(opened.db);
    const saved = personaAgentProfileSchema.parse(profiles.getPersonaAgent("QA", user.id));
    profiles.savePersonaAgent(user.id, { ...saved, name: "Renamed QA", persona: "New QA instructions" });
    await send("QA");
    expect(provider.startSession).toHaveBeenCalledTimes(3);
    expect(provider.sendTurn.mock.calls[3]?.[1]).toContain("New QA instructions");
    const rows = opened.db.select().from(messages).where(eq(messages.sessionId, session.id)).all();
    const assistantSnapshots = rows.filter(row => row.role === "assistant").map(row => JSON.parse(row.persona!));
    expect(assistantSnapshots.map(item => item.name)).toEqual(["Developer", "Developer", "QA", "Renamed QA"]);
    const history = await app.inject({ method: "GET", url: `/api/sessions/${session.id}/messages?limit=50`, headers });
    expect(history.json().messages.filter((item: {role: string}) => item.role === "assistant").map((item: {persona: {name: string}}) => item.persona.name)).toEqual(["Developer", "Developer", "QA", "Renamed QA"]);
    expect(getPersonaChatRuntime(user.id, "QA")).toEqual({ count: 0, state: "idle" });
    await app.inject({ method: "POST", url: "/api/chat", headers,
      payload: { sessionId: session.id, content: "Back to ordinary assistant", personaAgentId: null, provider: "codex", model: "saved-model", runtimeMode: "supervised" } });
    expect(provider.startSession).toHaveBeenCalledTimes(4);
    expect(provider.sendTurn.mock.calls[4]?.[1]).not.toContain("New QA instructions");
    expect(JSON.parse(sessions.getById(session.id, user.id)!.metadata!).chatPersonaAgentId).toBeNull();
  });

  it("rejects foreign, missing and paused personas before starting execution", async () => {
    const session = sessions.create({ userId: user.id, name: "Validation" });
    const profiles = new ThreadService(opened.db);
    const saved = personaAgentProfileSchema.parse(profiles.getPersonaAgent("Developer", user.id));
    profiles.savePersonaAgent(user.id, { ...saved, paused: true });
    const other = users.createUser("other-persona-user", "test-password");
    profiles.savePersonaAgent(other.id, { ...saved, id: "Foreign", reportsToId: null });
    for (const [personaAgentId, status] of [["Developer", 409], ["Foreign", 404], ["Missing", 404], [123, 400]] as const) {
      const response = await app.inject({ method: "POST", url: "/api/chat", headers,
        payload: { sessionId: session.id, content: "Do work", personaAgentId } });
      expect(response.statusCode).toBe(status);
    }
    expect(provider.startSession).not.toHaveBeenCalled();
    expect(opened.db.select().from(messages).where(eq(messages.sessionId, session.id)).all()).toHaveLength(0);
  });

  it("keeps otherwise identical queued requests addressed to different personas separate", async () => {
    const session = sessions.create({ userId: user.id, name: "Queue" });
    const state = new SessionStateService(opened.db);
    __chatTestUtils.activeStreams.add(session.id);
    try {
      for (const personaAgentId of ["Developer", "QA"]) {
        const response = await app.inject({ method: "POST", url: "/api/chat", headers,
          payload: { sessionId: session.id, content: "Same queued request", personaAgentId } });
        expect(response.statusCode).toBe(202);
      }
      const queue = state.get(session.id, ["queued_messages"])["queued_messages"] as Array<{personaAgentId: string}>;
      expect(queue.map(item => item.personaAgentId)).toEqual(["Developer", "QA"]);
      state.set(session.id, { queued_messages: null });
    } finally { __chatTestUtils.activeStreams.delete(session.id); }

  });

  it("resumes the selected persona after restart and attributes owned live runtime", async () => {
    const session = sessions.create({ userId: user.id, name: "Interrupted persona work" });
    const state = new SessionStateService(opened.db);
    state.set(session.id, { "chat.activeTurn": {
      turnId: "persona-turn-before-outage", startedAt: new Date().toISOString(), mode: "agent", responseStyle: "normal",
      personaAgentId: "QA", provider: "codex", runtimeMode: "full-access", model: "wrong-model",
    } });
    provider.beforeSend = () => {
      expect(getPersonaChatRuntime(user.id, "QA")).toEqual({ count: 1, state: "running" });
      expect(getPersonaChatRuntime("foreign-owner", "QA")).toEqual({ count: 0, state: "idle" });
      expect(getPersonaChatRuntime(user.id, "Developer")).toEqual({ count: 0, state: "idle" });
      expect((state.get(session.id, ["chat.activeTurn"])["chat.activeTurn"] as {personaAgentId: string}).personaAgentId).toBe("QA");
    };
    await expect((app as typeof app & { recoverInterruptedChatTurns: () => Promise<number> }).recoverInterruptedChatTurns()).resolves.toBe(1);
    await vi.waitFor(() => expect(provider.sendTurn).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(getPersonaChatRuntime(user.id, "QA")).toEqual({ count: 0, state: "idle" }));
    expect(provider.startSession.mock.calls[0]?.[0]).toMatchObject({ model: "saved-model", mode: "supervised" });
    expect(provider.sendTurn.mock.calls[0]?.[1]).toContain("Persona for QA");
    expect(opened.db.select().from(messages).where(eq(messages.sessionId, session.id)).all().filter(row => row.role === "assistant" && row.persona).map(row => JSON.parse(row.persona!).id)).toEqual(["QA"]);
  });

  it("dispatches through thread routes with identity and supervised settings without creating empty chats", async () => {
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
    expect(state.messages.at(-1).workThreadId).toBe(workId);
    expect(state.deliveries[0]).toMatchObject({ threadId: workId, threadStatus: "completed" });
    expect(sessions.getById(workId)).toBeUndefined();
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
    expect(state.messages[0]).toMatchObject({ content: "Use the board", sender: { kind: "chat", name: "Developer Chat", avatar: null, sourceSessionId: source.id } });
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
