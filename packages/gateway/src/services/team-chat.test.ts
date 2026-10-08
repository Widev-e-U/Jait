import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { ThreadService } from "./threads.js";
import { SessionService } from "./sessions.js";
import { TeamChatService, rankTeamRecipients } from "./team-chat.js";
import { createTeamChatTool } from "../tools/team-chat-tools.js";
import { personaAgentProfileSchema, type TeamSender, type TeamRoom } from "@jait/shared";

import * as systemOne from "./system-one.js";

const owner = "owner";
const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
  id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
  repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
  schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
});
const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };
const sender = (id: string): TeamSender => ({ kind: "agent", id, name: id, avatar: "Nova" });
describe("persistent team coordination", () => {
  let opened: Awaited<ReturnType<typeof openDatabase>>;
  let profiles: ThreadService;
  let sessions: SessionService;
  let service: TeamChatService;
  let room: TeamRoom;
  let databaseClosed = false;
  beforeEach(async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  });
  afterEach(() => { service.close(); if (!databaseClosed) opened.sqlite.close(); });
  const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });

  it("runs assignments in persona threads without creating ordinary chats", () => {
    post("Implement ticket", "thread-first", ["Developer"]);
    const delivery = service.deliveries(owner, room.id)[0]!;
    const thread = profiles.getById(delivery.sessionId)!;
    expect(thread).toMatchObject({ personaAgentId: "Developer", providerId: "codex", runtimeMode: "supervised" });
    expect(sessions.getById(delivery.sessionId)).toBeUndefined();
    expect(service.sender(owner, thread.id, room.id)).toMatchObject({ kind: "agent", id: "Developer" });
    expect(service.context(owner, thread.id)).toContain("Handle Developer work.");
  });

  it("keeps addressed agent status updates passive", () => {
    service.post(owner, room.id, { content: "Acknowledged", clientKey: "ack",
      sender: sender("Developer"), kind: "discussion", recipientIds: ["Scrum"] });
    expect(service.deliveries(owner, room.id)).toHaveLength(0);
    expect(service.history(owner, room.id)[0]!.recipientIds).toEqual(["Scrum"]);
  });

  it("ranks expertise and explicit names, excluding paused members", () => {
    const members = service.members(owner, room.rootAgentId);
    expect(rankTeamRecipients("Implement a bug fix", members, room.rootAgentId)[0]?.id).toBe("Developer");
    expect(rankTeamRecipients("QA, retest acceptance criteria", members, room.rootAgentId)[0]?.id).toBe("QA");
    expect(rankTeamRecipients("What next?", members, room.rootAgentId, "Developer")[0]?.id).toBe("Developer");
    expect(rankTeamRecipients("QA retest", members.map(member => ({ ...member, paused: member.id === "QA" })), room.rootAgentId).some(item => item.id === "QA")).toBe(false);
  });

  it("routes user messages, persists the chosen recipient and deduplicates retries", async () => {
    const input = { content: "Developer, implement the fix", clientKey: "auto", sender: human,
      attachments: [{ name: "evidence.txt", mimeType: "text/plain", data: "ZXZpZGVuY2U=" }] };
    const first = await service.postRouted(owner, room.id, input);
    expect(first.recipientIds).toEqual(["Developer"]);
    expect(first.attachments).toEqual(input.attachments);
    expect((await service.postRouted(owner, room.id, input)).id).toBe(first.id);
    expect(service.deliveries(owner, room.id)).toHaveLength(1);
    const sessionId = service.deliveries(owner, room.id)[0]!.sessionId;
    const context = service.context(owner, sessionId)!;
    expect(context).toContain("Your manager: Scrum");
    expect(context).toContain('"reportsToId":"Scrum"');
    expect(context).toContain("Escalate blockers");
    expect(context).toContain("evidence.txt");
    expect(context).not.toContain("ZXZpZGVuY2U=");
    expect((await service.postRouted(owner, room.id, { ...input, clientKey: "passive", sender: sender("Developer"), recipientIds: [] })).recipientIds).toEqual([]);
  });

  it("uses configured System One and falls back on failure or invalid recipients", async () => {
    service.setDecisionKeys(() => ({ SYSTEM_ONE_BASE_URL: "http://localhost:9999" }));
    const evaluate = vi.spyOn(systemOne, "evaluateDecision");
    try {
      evaluate.mockResolvedValue({ model: "test", answers: { recipient: { type: "choice", choice: "QA", confidence: 0.92 }, reason: { type: "choice", choice: "expertise" } } });
      expect((await service.postRouted(owner, room.id, { content: "Implement fix", clientKey: "system", sender: human })).recipientIds).toEqual(["QA"]);
      const recorded = service.history(owner, room.id).find(message => message.recipientIds.includes("QA"))!;
      expect(recorded.routingDecision).toMatchObject({ source: "system-one", model: "test", recipientId: "QA", confidence: 0.92, reason: "Role, skills, or persona expertise best match the request." });
      expect(recorded.routingDecision?.candidates.find(member => member.id === "Developer")).toMatchObject({ persona: "Handle Developer work." });
      expect((await service.postRouted(owner, room.id, { content: "Implement fix", clientKey: "system", sender: human })).routingDecision).toEqual(recorded.routingDecision);
      expect(evaluate).toHaveBeenCalledOnce();
      const state = JSON.parse(evaluate.mock.calls[0]![1]);
      expect(state.hierarchy.find((member: { id: string }) => member.id === "Developer")).toMatchObject({ persona: "Handle Developer work.", reportsToId: "Scrum" });
      evaluate.mockResolvedValue({ model: "test", answers: { recipient: { type: "choice", choice: "Research" } } });
      expect((await service.postRouted(owner, room.id, { content: "Implement fix", clientKey: "invalid", sender: human })).recipientIds).toEqual(["Developer"]);
      evaluate.mockRejectedValue(new Error("offline"));
      const fallback = await service.postRouted(owner, room.id, { content: "Implement fix", clientKey: "offline", sender: human });
      expect(fallback.recipientIds).toEqual(["Developer"]);
      expect(fallback.routingDecision).toMatchObject({ source: "fallback", recipientId: "Developer" });
      expect(fallback.routingDecision?.reason).toContain("unavailable");
      expect((await service.postRouted(owner, room.id, { content: "Implement fix", clientKey: "explicit", sender: human, recipientIds: ["Scrum"] })).recipientIds).toEqual(["Scrum"]);
      expect(evaluate).toHaveBeenCalledTimes(3);
    } finally { evaluate.mockRestore(); }
  });

  it("does not write to a closed database when an in-flight delivery finishes", async () => {
    let finish!: () => void;
    service.setDispatcher(async () => { await new Promise<void>(resolve => { finish = resolve; }); return { content: "Done" }; });
    post("Work", "closing", ["Developer"]);
    service.close();
    opened.sqlite.close();
    databaseClosed = true;
    finish();
    await new Promise(resolve => setTimeout(resolve, 10));
    // A late database write would reject unhandled and fail this regression.
  });

  it("reuses one room for the connected hierarchy and follows membership changes", () => {
    expect(service.ensureRoom(owner, "QA").id).toBe(room.id);
    expect(service.members(owner, room.rootAgentId).map(agent => agent.id).sort()).toEqual(["Developer", "QA", "Scrum"]);
    profiles.savePersonaAgent(owner, profile("QA", "Research"));
    expect(service.members(owner, room.rootAgentId).map(agent => agent.id)).not.toContain("QA");
    expect(service.ensureRoom(owner, "QA").id).not.toBe(room.id);
    expect(() => service.get("other", room.id)).toThrow("not found");
    expect(() => service.post(owner, room.id, { content: "Cross team", clientKey: "foreign", sender: human, recipientIds: ["Research"] })).toThrow("Recipients");
  });

  it("persists the neutral source-chat persona and deduplicates retry handoffs", async () => {
    const session = sessions.create({ userId: owner, name: "Developer Chat", projectPath: "/tmp/repo" });
    const tool = createTeamChatTool(service, sessions);
    const context = { sessionId: session.id, userId: owner, actionId: "relay", projectRoot: "/tmp/repo", requestedBy: "agent" };
    const input = { action: "send" as const, agentId: "Developer", content: "Use the Scrum board first.", clientKey: "same-relay" };
    expect((await tool.execute(input, context)).ok).toBe(true);
    expect((await tool.execute(input, context)).ok).toBe(true);
    const reloaded = new TeamChatService(opened.db, sessions, profiles);
    const message = reloaded.history(owner, room.id)[0]!;
    expect(message.sender).toEqual({ kind: "chat", id: session.id, name: "Developer Chat", avatar: null, sourceSessionId: session.id });
    expect(message.content).toBe("Use the Scrum board first.");
    expect(reloaded.deliveries(owner, room.id)).toHaveLength(1);
    expect(reloaded.get(owner, room.id).projectPath).toBe("/tmp/repo");
    const agentSession = reloaded.deliveries(owner, room.id)[0]!.sessionId;
    expect(reloaded.sender(owner, agentSession, room.id)).toMatchObject({ kind: "agent", id: "Scrum" });
  });

  it("delivers relay bodies without chat-title or username wrappers", async () => {
    const dispatcher = vi.fn(async () => ({ content: "Reviewed." }));
    service.setDispatcher(dispatcher);
    const source = sessions.create({ userId: owner, name: "Long source chat title", projectPath: "/tmp/repo" });
    const tool = createTeamChatTool(service, sessions);
    const content = "Continue the unfinished review.\nKeep the existing worktree.";
    const result = await tool.execute({ action: "send", roomId: room.id, content, recipientIds: ["QA"], clientKey: "plain-relay" },
      { sessionId: source.id, userId: owner, projectRoot: "/tmp/repo", requestedBy: "agent" });
    expect(result.ok).toBe(true);
    await vi.waitFor(() => expect(service.deliveries(owner, room.id)[0]?.status).toBe("completed"));
    expect(dispatcher).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "QA" }), content);
    expect(service.history(owner, room.id)[0]).toMatchObject({ content, kind: "relay",
      sender: { kind: "chat", name: "Long source chat title", sourceSessionId: source.id } });
  });

  it("queues independent threads for the same agent without simultaneous duplicate execution", async () => {
    let finish!: () => void;
    const wait = new Promise<void>(resolve => { finish = resolve; });
    const dispatcher = vi.fn(async () => { await wait; return { content: "Implemented and ready for review." }; });
    service.setDispatcher(dispatcher);
    post("Ticket one", "one", ["Developer"]);
    post("Ticket two", "two", ["Developer"]);
    expect(dispatcher).toHaveBeenCalledTimes(1);
    const deliveries = service.deliveries(owner, room.id);
    expect(new Set(deliveries.map(delivery => delivery.sessionId)).size).toBe(2);
    for (const delivery of deliveries) expect(service.workForSession(owner, delivery.sessionId)).toMatchObject({ roomId: room.id, agentId: "Developer" });
    finish();
    await vi.waitFor(() => expect(service.deliveries(owner, room.id).every(delivery => delivery.status === "completed")).toBe(true));
    expect(service.history(owner, room.id).filter(message => message.kind === "result")).toHaveLength(2);
  });

  it("targets existing work without impersonating another agent or crossing rooms", () => {
    const original = post("Build", "build", ["Developer"]);
    const work = service.deliveries(owner, room.id)[0]!;
    service.post(owner, room.id, { content: "Change the acceptance criteria.", sender: sender("Developer"), recipientIds: ["Developer"], clientKey: "steer", targetSessionId: work.sessionId, parentMessageId: original.id });
    expect(service.deliveries(owner, room.id)[1]!.sessionId).toBe(work.sessionId);
    expect(() => service.post(owner, room.id, { content: "Wrong owner", sender: human, recipientIds: ["QA"], clientKey: "invalid-steer", targetSessionId: work.sessionId })).toThrow("Target");
    const privateChat = sessions.create({ userId: "other" });
    expect(() => service.sender(owner, privateChat.id, room.id)).toThrow("Source chat");
  });

  it("requires independent verification for the current goal and evidence for all criteria", () => {
    const lead = sender("Scrum");
    service.setGoal(owner, room.id, "Ship notifications", ["Tests pass", "QA approves"], lead);
    expect(() => service.completeGoal(owner, room.id, ["Tests pass"], lead)).toThrow("every");
    expect(() => service.completeGoal(owner, room.id, ["Test report", "QA report"], lead)).toThrow("independent");
    service.post(owner, room.id, { content: "Verified tests and acceptance scenarios.", clientKey: "verify", sender: sender("QA"), kind: "verification", recipientIds: [] });
    expect(service.completeGoal(owner, room.id, ["test log", "QA report"], lead).goal?.status).toBe("completed");
    service.setGoal(owner, room.id, "Next ticket", ["Acceptance"], lead);
    expect(() => service.completeGoal(owner, room.id, ["Old QA report"], lead)).toThrow("independent");
    expect(() => service.setGoal(owner, room.id, "Take over", ["Test"], sender("Developer"))).toThrow("coordinator");
  });

  it("recovers queued work and surfaces interrupted work without replaying it", async () => {
    post("Before restart", "restart", ["Developer"]);
    const delivery = service.deliveries(owner, room.id)[0]!;
    opened.sqlite.prepare("UPDATE team_room_deliveries SET status = 'running' WHERE id = ?").run(delivery.id);
    const dispatcher = vi.fn(async () => ({ content: "should not run" }));
    const restored = new TeamChatService(opened.db, sessions, profiles);
    restored.setDispatcher(dispatcher); await restored.recover();
    expect(dispatcher).not.toHaveBeenCalled();
    expect(restored.deliveries(owner, room.id)[0]!.status).toBe("interrupted");
    restored.close();
  });

  it("bounds handoff loops and makes paused-recipient failures visible", () => {
    let parent = post("Start", "start", []);
    for (let depth = 1; depth <= 33; depth++) parent = service.post(owner, room.id, { content: "Round " + depth, clientKey: String(depth), sender: sender("Developer"), recipientIds: [], parentMessageId: parent.id });
    expect(() => service.post(owner, room.id, { content: "Loop", clientKey: "loop", sender: sender("Developer"), kind: "assignment", recipientIds: ["QA"], parentMessageId: parent.id })).toThrow("Handoff limit");
    profiles.savePersonaAgent(owner, { ...profile("QA", "Scrum"), paused: true });
    post("Review", "paused", ["QA"]);
    expect(service.deliveries(owner, room.id).at(-1)).toMatchObject({ status: "failed", error: "Agent is paused." });
  });
});
