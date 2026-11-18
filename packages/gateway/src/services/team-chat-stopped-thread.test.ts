import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { ThreadService } from "./threads.js";
import { SessionService } from "./sessions.js";
import { TeamChatService } from "./team-chat.js";
import { personaAgentProfileSchema, type TeamSender, type TeamRoom } from "@jait/shared";
import { teamDeliveries } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";

/**
 * D3 (ticket 4) cancel semantics — reproduction harness, failing-first on 08211a67.
 *
 * Defect: a `queued` team delivery is started even when the delivery's own thread was
 * stopped. The user-facing stop path is `POST /api/threads/:id/stop`
 * (`packages/gateway/src/routes/threads.ts:1947`), which calls
 * `ThreadService.markInterrupted(id)` and sets `agentThreads.status = "interrupted"`
 * (`packages/gateway/src/services/threads.ts:358-364`).
 *
 * `TeamChatService.pump()` (`team-chat.ts:334-345`) selects rows where
 * `status = 'queued'` and dispatches them, consulting only its in-memory concurrency
 * set and the same-agent in-flight guard. It never consults thread state, so a stopped
 * thread's queued turn is still handed to `runDelivery()` (`:363`). `recover()`
 * (`:330-333`) re-pumps leftover `queued` rows on restart with the same result.
 *
 * Expected behaviour once the state vocabulary gates `pump()`/`runDelivery()`: the
 * stopped delivery is never dispatched and is not left `queued` (a stale `queued` row
 * is what makes reconnect/status reporting dishonest). The exact terminal status of the
 * abandoned delivery is the implementation's call, so these tests assert only
 * "never executed" and "not still queued/running".
 */
describe("team chat cancel semantics for a stopped thread", () => {
  let opened: Awaited<ReturnType<typeof openDatabase>>;
  let profiles: ThreadService;
  let sessions: SessionService;
  let service: TeamChatService;
  let room: TeamRoom;
  let databaseClosed = false;

  const owner = "owner";
  const profile = (id: string, reportsToId: string | null = null) => personaAgentProfileSchema.parse({
    id, name: id, reportsToId, persona: "Handle " + id + " work.", avatar: "Nova", providerId: "codex",
    repositoryIds: [], skillIds: [], allowedTools: [], requiresApproval: true, paused: false,
    schedule: { kind: "adaptive", rules: "" }, notificationChannels: [], notificationEvents: [],
  });
  const human: TeamSender = { kind: "user", id: owner, name: "Jakob", avatar: null };

  beforeEach(async () => {
    databaseClosed = false;
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    profiles = new ThreadService(opened.db); sessions = new SessionService(opened.db);
    profiles.savePersonaAgent(owner, profile("Scrum"));
    profiles.savePersonaAgent(owner, profile("Developer", "Scrum"));
    profiles.savePersonaAgent(owner, profile("QA", "Scrum"));
    profiles.savePersonaAgent(owner, profile("Research", "Scrum"));
    service = new TeamChatService(opened.db, sessions, profiles);
    room = service.ensureRoom(owner, "Developer");
  });
  afterEach(() => { service.close(); if (!databaseClosed) opened.sqlite.close(); });

  const post = (content: string, key: string, recipientIds: string[]) =>
    service.post(owner, room.id, { content, clientKey: key, sender: human, recipientIds });

  /** Locate the delivery created for a message by content, without relying on row order. */
  const deliveryFor = (source: TeamChatService, content: string) => {
    const messages = new Map(source.history(owner, room.id).map(message => [message.id, message]));
    const found = source.deliveries(owner, room.id).find(delivery => messages.get(delivery.messageId)?.content === content);
    if (!found) throw new Error("No delivery for: " + content);
    return found;
  };

  it("immediately cancels queued followers on authoritative stop while dispatch remains unsettled", async () => {
    const dispatch = vi.fn(() => new Promise<{ content: string }>(() => {}));
    service.setDispatcher(dispatch);
    post("Unsettled active turn", "w3-active", ["Developer"]);
    const active = deliveryFor(service, "Unsettled active turn");
    profiles.markRunning(active.sessionId, "active-provider");
    expect(active.status).toBe("running");

    // Persist FIFO followers directly so this regression is independent of the
    // separate per-agent/per-thread dispatch serialization change.
    const followerIds = [uuidv7(), uuidv7()];
    for (const id of followerIds) {
      opened.db.insert(teamDeliveries).values({
        ...active, id, status: "queued", error: null,
      }).run();
    }
    const sibling = profiles.create({
      userId: owner, personaAgentId: "Developer", providerId: "codex", title: "Sibling work",
    });
    profiles.markRunning(sibling.id, "sibling-provider");
    const siblingDeliveryId = uuidv7();
    opened.db.insert(teamDeliveries).values({
      ...active, id: siblingDeliveryId, sessionId: sibling.id, status: "running",
    }).run();
    const siblingFollowerId = uuidv7();
    opened.db.insert(teamDeliveries).values({
      ...active, id: siblingFollowerId, sessionId: sibling.id, status: "queued",
    }).run();

    profiles.markInterrupted(active.sessionId);
    const statuses = new Map(service.deliveries(owner, room.id).map(row => [row.id, row.status]));
    // No pump, new post, or promise settlement after the stop.
    for (const id of followerIds) expect(statuses.get(id)).toBe("cancelled");
    expect(statuses.get(active.id)).toBe("running");
    expect(statuses.get(siblingDeliveryId)).toBe("running");
    expect(statuses.get(siblingFollowerId)).toBe("queued");
    expect(profiles.getById(sibling.id)?.status).toBe("running");
    expect(dispatch).toHaveBeenCalledTimes(1);
    profiles.markInterrupted(active.sessionId);
    expect(service.deliveries(owner, room.id).filter(row => followerIds.includes(row.id))
      .every(row => row.status === "cancelled")).toBe(true);
    const restored = new TeamChatService(opened.db, sessions, profiles);
    expect(restored.deliveries(owner, room.id).filter(row => followerIds.includes(row.id))
      .every(row => row.status === "cancelled")).toBe(true);
    restored.close();
  });

  it("preserves queued followers during automatic restart recovery", () => {
    post("Restart recovery work", "w3-recovery", ["Developer"]);
    const delivery = deliveryFor(service, "Restart recovery work");
    profiles.markRunning(delivery.sessionId, "recovery-provider");
    profiles.queueRestartRecovery();
    expect(profiles.getById(delivery.sessionId)?.status).toBe("interrupted");
    expect(profiles.getRecovery(delivery.sessionId)?.pending).toBe(true);
    expect(deliveryFor(service, "Restart recovery work").status).toBe("queued");
    profiles.markInterrupted(delivery.sessionId);
    expect(profiles.getRecovery(delivery.sessionId)).toBeUndefined();
    expect(deliveryFor(service, "Restart recovery work").status).toBe("cancelled");
  });

  it("never starts stopped work when dispatching a queued backlog", async () => {
    const started: string[] = [];
    const releases = new Map<string, () => void>();
    const dispatch = async (delivery: { id: string }) => {
      started.push(delivery.id);
      // Park only the two slot-holders; anything else that starts is a defect and
      // completes immediately so the failing run leaves no parked work behind.
      if (started.length <= 2) await new Promise<void>(resolve => { releases.set(delivery.id, resolve); });
      return { content: "Completed." };
    };

    // Queue the backlog before a dispatcher is available. Independent agents can
    // now run concurrently; stopping queued work must still prevent dispatch.
    post("Hold first slot", "slot-one", ["Developer"]);
    post("Hold second slot", "slot-two", ["QA"]);
    expect(started).toHaveLength(0);

    post("Work the user then stops", "stopped-work", ["Research"]);
    const stopped = deliveryFor(service, "Work the user then stops");
    expect(stopped.status).toBe("queued");
    expect(started).not.toContain(stopped.id);

    // The product stop path: POST /api/threads/:id/stop -> markInterrupted.
    profiles.markInterrupted(stopped.sessionId);
    expect(profiles.getById(stopped.sessionId)!.status).toBe("interrupted");
    service.setDispatcher(dispatch);
    await service.pump();
    expect(started).toHaveLength(2);

    const slotIds = service.deliveries(owner, room.id)
      .filter(delivery => delivery.id !== stopped.id).map(delivery => delivery.id);
    expect(slotIds).toHaveLength(2);
    for (const release of releases.values()) release();
    const statusOf = (source: TeamChatService, id: string) =>
      source.deliveries(owner, room.id).find(delivery => delivery.id === id)?.status;
    await vi.waitFor(() => expect(slotIds.every(id => statusOf(service, id) === "completed")).toBe(true));

    // The same call both `runDelivery()`'s finally block and `recover()` make.
    await service.pump();

    expect(started, "pump() dispatched a delivery whose thread the user stopped").not.toContain(stopped.id);
    const after = deliveryFor(service, "Work the user then stops");
    expect(after.status, "a stopped delivery must not be left mid-execution").not.toBe("running");
    // Not "queued" either: an abandoned queued row is what makes Agents/Threads and
    // reconnect reporting dishonest (ticket 4, D3). Cancel must reach a terminal status.
    expect(after.status, "a stopped delivery must not stay queued forever").not.toBe("queued");
  });

  it("does not replay a stopped thread's queued delivery after a gateway restart", async () => {
    // No dispatcher yet, so the delivery stays genuinely `queued` with nothing running.
    post("Queued work the user stopped", "stopped-before-restart", ["Developer"]);
    const stopped = deliveryFor(service, "Queued work the user stopped");
    expect(stopped.status).toBe("queued");
    expect(profiles.getById(stopped.sessionId)!.status).toBe("idle");
    profiles.markInterrupted(stopped.sessionId);

    const dispatcher = vi.fn(async () => ({ content: "should not run" }));
    const restored = new TeamChatService(opened.db, sessions, profiles);
    restored.setDispatcher(dispatcher);
    await restored.recover();

    expect(dispatcher).not.toHaveBeenCalled();
    const after = deliveryFor(restored, "Queued work the user stopped");
    expect(after.status).not.toBe("running");
    expect(after.status).not.toBe("queued");
    restored.close();
  });

  /**
   * Positive control. Proves the two failures above are the missing state check and not a
   * broken harness: the identical `pump()` path, fixture and fixtures-free dispatch still
   * start a queued delivery when nobody stopped its thread. This test passes before and
   * after the fix.
   */
  it("still dispatches a queued delivery whose thread is live (control)", async () => {
    post("Queued work nobody stopped", "live-thread", ["Developer"]);
    const live = deliveryFor(service, "Queued work nobody stopped");
    expect(live.status).toBe("queued");
    expect(profiles.getById(live.sessionId)!.status).toBe("idle");

    const dispatched: string[] = [];
    service.setDispatcher(async delivery => { dispatched.push(delivery.id); return { content: "Ran." }; });
    await service.pump();
    await vi.waitFor(() => expect(dispatched.length, "pump() must still run live work").toBe(1));
    expect(dispatched).toEqual([live.id]);
    await vi.waitFor(() => expect(deliveryFor(service, "Queued work nobody stopped").status).toBe("completed"));
  });
  it("keeps a real sibling dispatch running when stopping queued same-thread follow-ups", async () => {
    const releases = new Map<string, (value: { content: string }) => void>();
    const dispatch = vi.fn((delivery: { id: string }) => new Promise<{ content: string }>(resolve => {
      releases.set(delivery.id, resolve);
    }));
    service.setDispatcher(dispatch);
    try {
      post("Real active", "real-active", ["Developer"]);
      const active = deliveryFor(service, "Real active");
      profiles.markRunning(active.sessionId, "active-provider");
      post("Real sibling", "real-sibling", ["Developer"]);
      const sibling = deliveryFor(service, "Real sibling");
      profiles.markRunning(sibling.sessionId, "sibling-provider");
      service.post(owner, room.id, {
        content: "Real follower", clientKey: "real-follower", sender: human,
        recipientIds: ["Developer"], targetSessionId: active.sessionId,
      });
      const follower = deliveryFor(service, "Real follower");
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(follower.status).toBe("queued");
      profiles.markInterrupted(active.sessionId);
      expect(deliveryFor(service, "Real follower").status).toBe("cancelled");
      expect(deliveryFor(service, "Real sibling").status).toBe("running");
      expect(profiles.getById(sibling.sessionId)?.status).toBe("running");
      releases.get(sibling.id)!({ content: "" });
      await vi.waitFor(() => expect(deliveryFor(service, "Real sibling").status).toBe("completed"));
      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(deliveryFor(service, "Real follower").status).toBe("cancelled");
    } finally {
      service.close();
      for (const release of releases.values()) release({ content: "" });
      await Promise.resolve();
    }
  });

  it("finishes an in-flight turn that a stop aborts without a blocker or manager recovery", async () => {
    let abortTurn: (error: Error) => void = () => {};
    const dispatch = vi.fn(() => new Promise<never>((_resolve, reject) => { abortTurn = reject; }));
    service.setDispatcher(dispatch);
    post("Stopped mid-turn", "stop-mid-turn", ["Developer"]);
    const active = deliveryFor(service, "Stopped mid-turn");
    profiles.markRunning(active.sessionId, "stop-provider");
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1));
    // The product stop lands while the provider turn is still in flight...
    profiles.markInterrupted(active.sessionId);
    // ...and the provider then reports the aborted turn as a failure.
    abortTurn(new Error("Provider turn aborted."));
    await vi.waitFor(() => expect(deliveryFor(service, "Stopped mid-turn").status).toBe("interrupted"));
    // A user stop is not a failure: no blocker is posted and no manager recovery is queued.
    expect(service.history(owner, room.id).some(message => message.kind === "blocked")).toBe(false);
    expect(service.deliveries(owner, room.id)).toHaveLength(1);
  });
});
