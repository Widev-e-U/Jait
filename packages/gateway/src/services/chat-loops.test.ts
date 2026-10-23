import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { SessionService } from "./sessions.js";
import { ChatLoopService, chatLoopInstructions } from "./chat-loops.js";
import { createLoopTools } from "../tools/loop-tools.js";

describe("persistent chat goal loops", () => {
  let sessions: SessionService;
  let loops: ChatLoopService;
  let sessionId: string;
  let close: () => void;
  beforeEach(async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    close = () => sqlite.close();
    sessions = new SessionService(db);
    sessionId = sessions.create({ name: "Goal", metadata: { chat: { model: "saved" } } }).id;
    loops = new ChatLoopService(sessions);
  });
  afterEach(() => close());

  it("persists checkpoints, uses the next self-message once and keeps unrelated metadata", () => {
    const wake = vi.fn();
    loops.onWake = wake;
    const goal = loops.goal(sessionId, "Fix the issue", ["Regression test passes"]);
    loops.check(sessionId, { revision: goal.revision, outcome: "continue", summary: "Reproduced", nextMessage: "Implement the fix and rerun the test" });
    expect(loops.finishTurn(sessionId)).toMatchObject({ status: "running", iteration: 1, nextMessage: "Implement the fix and rerun the test" });
    const restarted = new ChatLoopService(sessions);
    expect(restarted.running()).toHaveLength(1);
    expect(restarted.get(sessionId)).toMatchObject({ goal: "Fix the issue", iteration: 1, summary: "Reproduced" });
    expect(JSON.parse(sessions.getById(sessionId)!.metadata!).chat.model).toBe("saved");
    expect(restarted.finishTurn(sessionId)?.nextMessage).toContain("Verify completed work before repeating actions");
    expect(wake).toHaveBeenCalledWith(sessionId);
  });

  it("rejects empty goals and false completion without verification for every criterion", () => {
    expect(() => loops.goal(sessionId, " ", ["Pass"])).toThrow();
    const goal = loops.goal(sessionId, "Fix", ["Regression passes", "Build passes"]);
    expect(() => loops.check(sessionId, { revision: goal.revision, outcome: "complete", summary: "Done", evidence: ["Regression passes"] })).toThrow(/per acceptance criterion/);
    expect(loops.get(sessionId)?.status).toBe("running");
    expect(loops.check(sessionId, { revision: goal.revision, outcome: "complete", summary: "Verified", evidence: ["Test command exit 0", "Build command exit 0"] }).status).toBe("completed");
    expect(loops.running()).toHaveLength(0);
    expect(() => loops.control(sessionId, "resume")).toThrow(/new goal/);
  });

  it("pause, replacement and resume invalidate stale agent checks", () => {
    const first = loops.goal(sessionId, "First", ["Pass"]);
    loops.control(sessionId, "pause");
    expect(loops.finishTurn(sessionId)?.status).toBe("paused");
    loops.control(sessionId, "resume");
    expect(() => loops.check(sessionId, { revision: first.revision, outcome: "complete", summary: "Stale", evidence: ["old"] })).toThrow(/changed/);
    const next = loops.goal(sessionId, "Second", ["New evidence"]);
    expect(next.id).not.toBe(first.id);
    // Replacing a goal also needs a fresh revision, even at the same iteration.
    expect(() => loops.check(sessionId, { revision: first.revision, outcome: "complete", summary: "Stale", evidence: ["old"] })).toThrow(/changed/);
  });

  it("pauses on cancellation and errors and preserves an explicit waiting checkpoint", () => {
    loops.goal(sessionId, "Fix", ["Pass"]);
    expect(loops.finishTurn(sessionId, undefined, true)?.status).toBe("paused");
    loops.control(sessionId, "resume");
    expect(loops.finishTurn(sessionId, "Provider failed")?.status).toBe("error");
    const goal = loops.control(sessionId, "resume");
    loops.check(sessionId, { revision: goal.revision, outcome: "waiting", summary: "Which target is authorized?" });
    expect(loops.finishTurn(sessionId)?.status).toBe("waiting");
    expect(chatLoopInstructions(loops.get(sessionId))).toBeUndefined();
  });

  it("collects submitted structured answers before continuing and preserves explicit pauses", () => {
    const goal = loops.goal(sessionId, "Fix", ["Pass"]);
    loops.check(sessionId, { revision: goal.revision, outcome: "waiting", summary: "Which target?" });
    expect(loops.resumeAfterAnswer(sessionId, "question-1")).toMatchObject({ status: "running", checkedIteration: -1 });
    expect(loops.get(sessionId)?.nextMessage).toContain('requestId="question-1"');
    loops.control(sessionId, "pause");
    expect(loops.resumeAfterAnswer(sessionId, "question-2")?.status).toBe("paused");
  });

  it("does not copy autorun into question branches", () => {
    const user = sessions.create({ userId: "fork-owner", name: "Original" });
    loops.goal(user.id, "Fix", ["Pass"], "fork-owner");
    const branch = sessions.fork(user.id, { userId: "fork-owner" })!;
    expect(loops.get(branch.id)).toBeNull();
    expect(loops.get(user.id)?.status).toBe("running");
  });

  it("tools reject unauthenticated and worker contexts", async () => {
    const goal = createLoopTools(loops).find(tool => tool.name === "loop.goal")!;
    const context = { sessionId, actionId: "test", projectRoot: ".", requestedBy: "test" };
    expect((await goal.execute({ goal: "Fix", criteria: ["Pass"] }, context)).ok).toBe(false);
    expect((await goal.execute({ goal: "Fix", criteria: ["Pass"] }, { ...context, userId: "owner", threadId: "different-thread" })).ok).toBe(false);
    expect(loops.get(sessionId)).toBeNull();
  });
});
