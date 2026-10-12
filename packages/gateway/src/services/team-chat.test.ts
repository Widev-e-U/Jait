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
  afterEach(() => { vi.restoreAllMocks(); service.close(); if (!databaseClosed) opened.sqlite.close(); });
  const post = (content: string, key: string, recipientIds?: string[]) => service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });

  it("runs independent tasks for the same agent concurrently while queuing same-thread follow-ups", async () => {
    const members = Array.from({ length: 7 }, (_, i) => "Worker" + i);
    for (const id of members) profiles.savePersonaAgent(owner, profile(id));
    const selected = service.createRoom(owner, { name: "All workers", memberIds: members });
    const releases: Array<() => void> = [];
    const dispatch = vi.fn((_delivery: unknown, _agent: unknown, _prompt: string) => new Promise<{ content: string }>(resolve => {
      releases.push(() => resolve({ content: "Done" }));
    }));
    service.setDispatcher(dispatch);
    try {
      service.post(owner, selected.id, { content: "Work", clientKey: "all", sender: human, recipientIds: members });
      const firstThread = service.deliveries(owner, selected.id).find(d => d.agentId === members[0])!.sessionId;
      service.post(owner, selected.id, { content: "Independent task", clientKey: "independent", sender: human, recipientIds: [members[0]!] });
      expect(dispatch).toHaveBeenCalledTimes(8);
      service.post(owner, selected.id, { content: "Follow up", clientKey: "follow-up", sender: human,
        recipientIds: [members[0]!], targetSessionId: firstThread });
      expect(dispatch).toHaveBeenCalledTimes(8);
      expect(service.deliveries(owner, selected.id).filter(d => d.status === "running")).toHaveLength(8);
      expect(service.deliveries(owner, selected.id).filter(d => d.status === "queued")).toHaveLength(1);
      // Multiple continuations stay in FIFO order without blocking the independent task.
      service.post(owner, selected.id, { content: "Second follow up", clientKey: "follow-up-2", sender: human,
        recipientIds: [members[0]!], targetSessionId: firstThread });
      expect(dispatch).toHaveBeenCalledTimes(8);
      releases[0]!();
      await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(9));
      expect(dispatch.mock.calls.at(-1)?.[2]).toBe("Follow up");
      expect(service.deliveries(owner, selected.id).filter(d => d.status === "queued")).toHaveLength(1);
      releases[8]!();
      await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(10));
      expect(dispatch.mock.calls.at(-1)?.[2]).toBe("Second follow up");
      expect(service.deliveries(owner, selected.id).filter(d => d.status === "queued")).toHaveLength(0);
    } finally {
      service.close();
      for (const release of releases) release();
      await Promise.resolve();
    }
  });

  it("parks infrastructure blockers without sending the same broken environment to a manager", async () => {
    const dispatch = vi.fn(async () => { throw new Error("Execution blocked: Required executable unavailable persisted after two retries."); });
    service.setDispatcher(dispatch);
    post("Implement fix", "blocked-env", ["Developer"]);
    await vi.waitFor(() => expect(service.deliveries(owner, room.id)[0]?.status).toBe("blocked"));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(service.history(owner, room.id).filter(message => message.kind === "review")).toHaveLength(0);
    expect(service.history(owner, room.id).some(message => message.kind === "blocked")).toBe(true);
    service.close();
    const reopened = new TeamChatService(opened.db, sessions, profiles);
    expect(reopened.deliveries(owner, room.id)[0]?.status).toBe("blocked");
    reopened.close();
  });

  it("persists multiple chats with independent selected membership and histories", () => {
    const first = service.createRoom(owner, { name: "Implementation", memberIds: ["Developer", "Research"] });
    const second = service.createRoom(owner, { name: "Review", memberIds: ["Developer", "QA"] });
    expect(first.id).not.toBe(second.id);
    expect(service.list(owner).map(room => room.id)).toEqual(expect.arrayContaining([room.id, first.id, second.id]));
    expect(service.ensureRoom(owner, "Developer").id).toBe(room.id);
    expect(service.roomMembers(owner, first.id).map(agent => agent.id).sort()).toEqual(["Developer", "Research"]);
    service.post(owner, first.id, { content: "Investigate", clientKey: "same-key", sender: human, recipientIds: [] });
    service.post(owner, second.id, { content: "Review", clientKey: "same-key", sender: human, recipientIds: [] });
    expect(service.history(owner, first.id).map(message => message.content)).toEqual(["Investigate"]);
    expect(service.history(owner, second.id).map(message => message.content)).toEqual(["Review"]);
    profiles.savePersonaAgent(owner, profile("Research", "Scrum"));
    expect(service.roomMembers(owner, first.id).map(agent => agent.id)).toContain("Research");
    expect(service.roomMembers(owner, second.id).map(agent => agent.id)).not.toContain("Research");
    const reopened = new TeamChatService(opened.db, sessions, profiles);
    expect(reopened.get(owner, first.id).memberIds).toEqual(["Developer", "Research"]);
    reopened.close();
  });

  it("rejects foreign members and handoffs outside a room's selected membership", async () => {
    profiles.savePersonaAgent("other", profile("Foreign"));
    expect(() => service.createRoom(owner, { name: "", memberIds: ["QA"] })).toThrow();
    expect(() => service.createRoom(owner, { name: "Empty", memberIds: [] })).toThrow();
    expect(() => service.createRoom(owner, { name: "Foreign", memberIds: ["Foreign"] })).toThrow();
    const selected = service.createRoom(owner, { name: "Selected", memberIds: ["Developer", "Research", "Research"] });
    expect(selected.memberIds).toEqual(["Developer", "Research"]);
    expect(() => service.get("other", selected.id)).toThrow();
    expect(service.list("other")).toEqual([]);
    expect(() => service.post(owner, selected.id, { content: "QA review", clientKey: "outside", sender: human, recipientIds: ["QA"] })).toThrow(/members/);
    expect(() => service.post(owner, selected.id, { content: "Joining", clientKey: "sender", sender: sender("Scrum") })).toThrow(/member/);
    const routed = await service.postRouted(owner, selected.id, { content: "Research this", clientKey: "routing", sender: human });
    expect(routed.recipientIds).toEqual(["Research"]);
    const delivery = service.deliveries(owner, selected.id)[0]!;
    expect(service.context(owner, delivery.sessionId)).not.toContain("Your manager: Scrum");
    expect(service.context(owner, delivery.sessionId)).toContain(selected.id);
  });

  it("requires root coordinators and intermediate managers to verify completion", () => {
    profiles.savePersonaAgent(owner, profile("Junior", "Developer"));
    const rootContext = service.context(owner, "", profile("Scrum"))!;
    const managerContext = service.context(owner, "", profile("Developer", "Scrum"))!;
    const juniorContext = service.context(owner, "", profile("Junior", "Developer"))!;
    expect(rootContext).toContain("Leadership completion check:");
    expect(managerContext).toContain("Leadership completion check:");
    expect(managerContext).toContain("met, not-yet-met or blocked");
    expect(managerContext).toContain("Only the room coordinator");
    expect(juniorContext).not.toContain("Leadership completion check:");
  });

  it("derives leadership from current reporting lines rather than names or personas", () => {
    expect(service.context(owner, "", profile("Developer", "Scrum"))).not.toContain("Leadership completion check:");
    profiles.savePersonaAgent(owner, profile("Junior", "Developer"));
    expect(service.context(owner, "", profile("Developer", "Scrum"))).toContain("Leadership completion check:");
    profiles.savePersonaAgent(owner, profile("Junior", "QA"));
    expect(service.context(owner, "", profile("Developer", "Scrum"))).not.toContain("Leadership completion check:");
    expect(service.context(owner, "", profile("QA", "Scrum"))).toContain("Leadership completion check:");
  });

  it("queues one completion review for a worker outcome and reuses the manager thread", () => {
    service.setGoal(owner, room.id, "Ship", ["Acceptance passes"], human);
    post("Coordinate delivery", "manager-start", ["Scrum"]);
    const managerThread = service.deliveries(owner, room.id)[0]!.sessionId;
    post("Implement", "worker-start", ["Developer"]);
    const worker = service.deliveries(owner, room.id)[1]!;
    const outcome = { sender: { ...sender("Developer"), sourceSessionId: worker.sessionId },
      kind: "result" as const, content: "Local tests pass; PR still missing.", recipientIds: [],
      clientKey: "worker-outcome", workSessionId: worker.sessionId };
    service.post(owner, room.id, outcome);
    service.post(owner, room.id, outcome);
    const checks = service.history(owner, room.id).filter(message => message.content.startsWith("Leadership completion check:"));
    expect(checks).toHaveLength(1);
    expect(checks[0]!.recipientIds).toEqual(["Scrum"]);
    expect(checks[0]!.targetSessionId).toBe(managerThread);
    expect(service.deliveries(owner, room.id)).toHaveLength(3);
    expect(service.get(owner, room.id).goal?.status).toBe("active");
  });

  it("routes outcome verification to an intermediate manager before the root coordinator", () => {
    profiles.savePersonaAgent(owner, profile("Junior", "Developer"));
    service.setGoal(owner, room.id, "Ship", ["Acceptance passes"], human);
    post("Implement", "junior-start", ["Junior"]);
    const worker = service.deliveries(owner, room.id)[0]!;
    service.post(owner, room.id, { sender: { ...sender("Junior"), sourceSessionId: worker.sessionId },
      kind: "verification", content: "Acceptance evidence", recipientIds: [], clientKey: "junior-outcome" });
    expect(service.deliveries(owner, room.id).at(-1)?.agentId).toBe("Developer");
    expect(service.history(owner, room.id).at(-1)?.content).toContain("Leadership completion check:");
  });

  it("checks final dispatcher results even when the worker does not explicitly post", async () => {
    service.setGoal(owner, room.id, "Ship", ["PR merged"], human);
    const dispatcher = vi.fn(async (_delivery, agent) => ({ content: agent.id === "Developer" ?
      "Tests pass; PR not merged." : "Not yet complete: PR and independent review remain." }));
    service.setDispatcher(dispatcher);
    post("Implement", "dispatcher-worker", ["Developer"]);
    await vi.waitFor(() => expect(dispatcher).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(service.deliveries(owner, room.id).every(delivery => delivery.status === "completed")).toBe(true));
    expect(service.get(owner, room.id).goal?.status).toBe("active");
    expect(service.history(owner, room.id).filter(message => message.content.startsWith("Leadership completion check:"))).toHaveLength(1);
  });

  it("does not route outcome checks outside selected room membership", () => {
    const selected = service.createRoom(owner, { name: "Worker only", memberIds: ["Developer", "QA"] });
    service.setGoal(owner, selected.id, "Ship", ["Tests pass"], human);
    service.post(owner, selected.id, { sender: human, kind: "assignment", content: "Implement",
      recipientIds: ["Developer"], clientKey: "selected-worker" });
    const worker = service.deliveries(owner, selected.id)[0]!;
    service.post(owner, selected.id, { sender: { ...sender("Developer"), sourceSessionId: worker.sessionId },
      kind: "result", content: "Outcome", recipientIds: [], clientKey: "selected-result" });
    expect(service.deliveries(owner, selected.id)).toHaveLength(1);
    expect(service.deliveries(owner, room.id)).toHaveLength(0);
  });

  it("does not wake leaders for untracked claims, paused managers or completed goals", () => {
    service.setGoal(owner, room.id, "Ship", ["Acceptance passes"], human);
    service.post(owner, room.id, { sender: sender("Developer"), kind: "result",
      content: "Claim", recipientIds: [], clientKey: "untracked" });
    expect(service.deliveries(owner, room.id)).toHaveLength(0);
    post("Implement", "worker-start", ["Developer"]);
    const worker = service.deliveries(owner, room.id)[0]!;
    profiles.savePersonaAgent(owner, { ...profile("Scrum"), paused: true });
    const outcome = { sender: { ...sender("Developer"), sourceSessionId: worker.sessionId },
      kind: "result" as const, content: "Outcome", recipientIds: [] };
    service.post(owner, room.id, { ...outcome, clientKey: "paused" });
    expect(service.deliveries(owner, room.id)).toHaveLength(1);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    service.completeGoal(owner, room.id, ["User accepted"], human);
    service.post(owner, room.id, { ...outcome, clientKey: "completed" });
    expect(service.deliveries(owner, room.id)).toHaveLength(1);
  });

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

  it("runs independent threads for the same agent without duplicate execution", async () => {
    let finish!: () => void;
    const wait = new Promise<void>(resolve => { finish = resolve; });
    const dispatcher = vi.fn(async () => { await wait; return { content: "Implemented and ready for review." }; });
    service.setDispatcher(dispatcher);
    post("Ticket one", "one", ["Developer"]);
    post("Ticket two", "two", ["Developer"]);
    expect(dispatcher).toHaveBeenCalledTimes(2);
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

  it("treats explicit blockers as failed and asks the manager to recover once", async () => {
    const dispatcher = vi.fn(async (delivery, agent) => {
      if (agent.id === "Developer") {
        service.post(owner, room.id, { sender: { ...sender(agent.id), sourceSessionId: delivery.sessionId },
          content: "Bun is unavailable; prepare the test runtime.", kind: "blocked", recipientIds: [],
          clientKey: "explicit-block", parentMessageId: delivery.messageId });
        return { content: "I could not run tests." };
      }
      return { content: "Escalated the environment blocker." };
    });
    service.setDispatcher(dispatcher);
    post("Verify the change", "blocked-work", ["Developer"]);
    await vi.waitFor(() => expect(service.deliveries(owner, room.id)[0]?.status).toBe("failed"));
    await vi.waitFor(() => expect(dispatcher).toHaveBeenCalledTimes(2));
    expect(service.deliveries(owner, room.id)[0]?.error).toContain("Bun is unavailable");
    expect(service.history(owner, room.id).filter(message => message.kind === "review")).toHaveLength(1);
    expect(service.history(owner, room.id).find(message => message.kind === "review")).toMatchObject({ recipientIds: ["Scrum"] });
    expect(service.history(owner, room.id).filter(message => message.kind === "blocked")).toHaveLength(1);
  });

  it("escalates provider failures once and stops when the coordinator also fails", async () => {
    const dispatcher = vi.fn(async () => { throw new Error("Provider request failed"); });
    service.setDispatcher(dispatcher);
    post("Implement", "provider-failure", ["Developer"]);
    await vi.waitFor(() => expect(service.deliveries(owner, room.id)).toHaveLength(2));
    await vi.waitFor(() => expect(service.deliveries(owner, room.id).every(item => item.status === "failed")).toBe(true));
    expect(dispatcher).toHaveBeenCalledTimes(2);
    expect(service.history(owner, room.id).filter(message => message.kind === "blocked")).toHaveLength(2);
    expect(service.history(owner, room.id).filter(message => message.kind === "review")).toHaveLength(1);
  });

  it("does not wake paused managers or recover a closed goal", async () => {
    profiles.savePersonaAgent(owner, { ...profile("Scrum"), paused: true });
    const dispatcher = vi.fn(async () => { throw new Error("Tool consent timed out"); });
    service.setDispatcher(dispatcher);
    post("Implement", "paused-manager", ["Developer"]);
    await vi.waitFor(() => expect(service.deliveries(owner, room.id)[0]?.status).toBe("failed"));
    expect(dispatcher).toHaveBeenCalledTimes(1);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    service.setGoal(owner, room.id, "Done", ["verified"], human);
    service.completeGoal(owner, room.id, ["test evidence"], human);
    post("Implement", "closed-goal", ["Developer"]);
    await vi.waitFor(() => expect(service.deliveries(owner, room.id)[1]?.status).toBe("failed"));
    expect(service.deliveries(owner, room.id)).toHaveLength(2);
  });

  it("allows a later verified result to resolve an earlier blocker in the same turn", async () => {
    service.setDispatcher(async (delivery, agent) => {
      for (const kind of ["blocked", "verification"] as const) service.post(owner, room.id, {
        sender: { ...sender(agent.id), sourceSessionId: delivery.sessionId }, content: kind,
        kind, recipientIds: [], clientKey: delivery.id + ":" + kind, parentMessageId: delivery.messageId,
      });
      return { content: "Verified." };
    });
    post("Verify", "resolved-blocker", ["QA"]);
    await vi.waitFor(() => expect(service.deliveries(owner, room.id)[0]?.status).toBe("completed"));
    expect(service.deliveries(owner, room.id)).toHaveLength(1);
  });

  // Room history, delivery settlement and goal verification all order messages by id, so a
  // burst of messages created inside one millisecond must still be read back in post order.
  it("reads back room history in post order for messages created in the same millisecond", () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2024-06-15T12:34:56.789Z").getTime());
    const posted = Array.from({ length: 40 }, (_, index) => post("Burst " + index, "burst-" + index));
    const history = service.history(owner, room.id).filter(item => item.content.startsWith("Burst "));
    expect(history.map(item => item.id)).toEqual(posted.map(item => item.id));
  });

  // Same-turn blocker + verification is the delivery-status contract: settlement must follow
  // creation order, not the random tail of the ids, however often the turn is repeated.
  it("settles a same-turn blocker resolved by verification as completed on repeated turns", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2024-06-15T12:34:56.789Z").getTime());
    service.setDispatcher(async (delivery, agent) => {
      for (const kind of ["blocked", "verification"] as const) service.post(owner, room.id, {
        sender: { ...sender(agent.id), sourceSessionId: delivery.sessionId }, content: kind,
        kind, recipientIds: [], clientKey: delivery.id + ":" + kind, parentMessageId: delivery.messageId,
      });
      return { content: "Verified." };
    });
    for (let round = 0; round < 25; round += 1) {
      const message = post("Verify " + round, "resolved-blocker-" + round, ["QA"]);
      await vi.waitFor(() => {
        const delivery = service.deliveries(owner, room.id).find(item => item.messageId === message.id);
        expect({ round, status: delivery?.status, error: delivery?.error }).toEqual({ round, status: "completed", error: null });
      }, { timeout: 2_000, interval: 10 });
    }
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
