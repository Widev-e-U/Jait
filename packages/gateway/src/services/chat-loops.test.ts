import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { SessionService } from "./sessions.js";
import { ChatLoopService, chatLoopInstructions } from "./chat-loops.js";
import * as systemOne from "./system-one.js";
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
  afterEach(() => { vi.restoreAllMocks(); close(); });

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
    expect(chatLoopInstructions(loops.get(sessionId))).toContain("Loop status: waiting");
  });

  it("keeps stopped goals visible without granting permission to resume", () => {
    expect(chatLoopInstructions(null)).toBeUndefined();
    loops.goal(sessionId, "Finish migration", ["All components verified"]);
    loops.finishTurn(sessionId, "Workspace is out of credits");
    const instructions = chatLoopInstructions(loops.get(sessionId))!;
    expect(instructions).toContain("Loop status: error");
    expect(instructions).toContain("Workspace is out of credits");
    expect(instructions).toContain("All components verified");
    expect(instructions).toContain("loop.resume before working on it");
    expect(instructions).toContain("Background notifications and unrelated messages do not authorize resumption");
    expect(loops.running()).toHaveLength(0);
    loops.control(sessionId, "pause");
    expect(chatLoopInstructions(loops.get(sessionId))).toContain("Loop status: paused");
    const resumed = loops.control(sessionId, "resume");
    expect(chatLoopInstructions(resumed)).toContain("Before ending this turn");
    loops.check(sessionId, { revision: resumed.revision, outcome: "complete", summary: "Verified", evidence: ["All checks passed"] });
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
  const keys = { SYSTEM_ONE_API_KEY: "test-key" };
  function verdict(passed = true, progress = true) {
    return { model: "monitor-test", answers: {
      progress: { type: "choice" as const, choice: progress ? "progress" : "stalled", confidence: 0.95 },
      criterion_0: { type: "choice" as const, choice: passed ? "passed" : "unverified", confidence: 0.95 },
    } };
  }

  it("requires configured System One to accept completion and records its review", async () => {
    const evaluate = vi.spyOn(systemOne, "evaluateDecision").mockResolvedValue(verdict(false));
    const goal = loops.goal(sessionId, "Fix", ["Regression passes"]);
    const input = { revision: goal.revision, outcome: "complete" as const, summary: "Tested", evidence: ["Regression test exit 0"] };
    const rejected = await loops.checkMonitored(sessionId, input, undefined, keys);
    expect(rejected).toMatchObject({ status: "running", monitor: { status: "rejected", criteriaPassed: [false], reviewedRevision: goal.revision } });
    expect(rejected.nextMessage).toContain("criteria 1");
    evaluate.mockResolvedValue(verdict());
    const completed = await loops.checkMonitored(sessionId, { ...input, revision: rejected.revision }, undefined, keys);
    expect(completed).toMatchObject({ status: "completed", monitor: { status: "accepted", model: "monitor-test" } });
    expect(evaluate.mock.calls[0][1]).toContain("Regression test exit 0");
    expect(evaluate.mock.calls[0][1]).not.toContain("test-key");
  });

  it("rejects uncertain or missing criterion decisions", async () => {
    const result = verdict();
    result.answers.criterion_0.confidence = 0.5;
    vi.spyOn(systemOne, "evaluateDecision").mockResolvedValue(result);
    const goal = loops.goal(sessionId, "Fix", ["Pass"]);
    expect(await loops.checkMonitored(sessionId, { revision: goal.revision, outcome: "complete", summary: "Done", evidence: ["Test exit 0"] }, undefined, keys))
      .toMatchObject({ status: "running", monitor: { status: "rejected" } });
  });

  it("pauses on monitor failure without leaking errors or accepting completion", async () => {
    vi.spyOn(systemOne, "evaluateDecision").mockRejectedValue(new Error("private endpoint credentials"));
    const goal = loops.goal(sessionId, "Fix", ["Pass"]);
    const result = await loops.checkMonitored(sessionId, { revision: goal.revision, outcome: "complete", summary: "Done", evidence: ["Test exit 0"] }, undefined, keys);
    expect(result).toMatchObject({ status: "paused", monitor: { status: "unavailable" } });
    expect(JSON.stringify(result)).not.toContain("private endpoint");
  });

  it("does not overwrite pauses or replacement goals during model evaluation", async () => {
    let resolve!: (value: ReturnType<typeof verdict>) => void;
    vi.spyOn(systemOne, "evaluateDecision").mockImplementation(() => new Promise(r => { resolve = r; }));
    for (const action of ["pause", "replace"] as const) {
      const goal = loops.goal(sessionId, "Fix", ["Pass"]);
      const pending = loops.checkMonitored(sessionId, { revision: goal.revision, outcome: "complete", summary: "Done", evidence: ["Test exit 0"] }, undefined, keys);
      if (action === "pause") loops.control(sessionId, "pause");
      else loops.goal(sessionId, "Different goal", ["Different check"]);
      resolve(verdict());
      await expect(pending).rejects.toThrow("changed");
      expect(loops.get(sessionId)?.status).toBe(action === "pause" ? "paused" : "running");
      expect(loops.get(sessionId)?.monitor).toBeUndefined();
    }
  });

  it("pauses after three stalled checkpoints and renews budgets only on explicit resume", async () => {
    vi.spyOn(systemOne, "evaluateDecision").mockResolvedValue(verdict(false, false));
    loops.goal(sessionId, "Fix", ["Pass"]);
    for (let i = 0; i < 3; i++) {
      const goal = loops.get(sessionId)!;
      await loops.checkMonitored(sessionId, { revision: goal.revision, outcome: "continue", summary: `Attempt ${i}`, nextMessage: "Inspect failure" }, undefined, keys);
      loops.finishTurn(sessionId);
    }
    expect(loops.get(sessionId)).toMatchObject({ status: "paused", stalledChecks: 3 });
    expect(loops.control(sessionId, "resume")).toMatchObject({ status: "running", stalledChecks: 0, budgetStartIteration: 3 });
  });

  it("bounds unchecked turns and total turns even without System One", () => {
    loops.goal(sessionId, "Fix", ["Pass"]);
    for (let i = 0; i < 3; i++) loops.finishTurn(sessionId);
    expect(loops.get(sessionId)?.status).toBe("paused");
    loops.control(sessionId, "resume");
    for (let i = 0; i < 50; i++) {
      const goal = loops.get(sessionId)!;
      loops.check(sessionId, { revision: goal.revision, outcome: "continue", summary: `Progress ${i}`, nextMessage: "Next" });
      loops.finishTurn(sessionId);
    }
    expect(loops.get(sessionId)).toMatchObject({ status: "paused", iteration: 53 });
  });

  it("awaits monitored tool results, preserving unconfigured behavior and waiting checkpoints", async () => {
    const evaluate = vi.spyOn(systemOne, "evaluateDecision");
    const user = sessions.create({ userId: "owner", name: "Tool chat" });
    const goal = loops.goal(user.id, "Fix", ["Pass"], "owner");
    const tool = createLoopTools(loops).find(t => t.name === "loop.check")!;
    const result = await tool.execute({ revision: goal.revision, outcome: "complete", summary: "Tested", evidence: ["exit 0"] },
      { sessionId: user.id, userId: "owner", actionId: "test", projectRoot: ".", requestedBy: "test" });
    expect(result).toMatchObject({ ok: true, data: { status: "completed", monitor: { status: "disabled" } } });
    const waiting = loops.goal(sessionId, "Fix", ["Pass"]);
    expect(await loops.checkMonitored(sessionId, { revision: waiting.revision, outcome: "waiting", summary: "Need user answer" }, undefined, keys)).toMatchObject({ status: "waiting" });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("scrubs configured credentials and authorization text from review state", async () => {
    const evaluate = vi.spyOn(systemOne, "evaluateDecision").mockResolvedValue(verdict());
    const goal = loops.goal(sessionId, "Fix", ["Pass"]);
    await loops.checkMonitored(sessionId, { revision: goal.revision, outcome: "complete",
      summary: "Bearer other-secret https://user:password@example.com",
      evidence: ["Test passed; test-key"] }, undefined, keys);
    const state = evaluate.mock.calls[0][1];
    expect(state).not.toContain("test-key");
    expect(state).not.toContain("other-secret");
    expect(state).not.toContain("user:password");
    expect(state).toContain("[REDACTED]");
  });

  it("pauses oversized review state without sending incomplete criteria", async () => {
    const evaluate = vi.spyOn(systemOne, "evaluateDecision");
    const goal = loops.goal(sessionId, "Fix", Array.from({ length: 20 }, () => "x".repeat(2000)));
    const result = await loops.checkMonitored(sessionId, { revision: goal.revision, outcome: "complete",
      summary: "Done", evidence: Array.from({ length: 20 }, () => "Reported test passed") }, undefined, keys);
    expect(result).toMatchObject({ status: "paused", monitor: { status: "unavailable" } });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("allows verified completion after previous stalled checkpoints", async () => {
    vi.spyOn(systemOne, "evaluateDecision").mockResolvedValue(verdict(false, false));
    loops.goal(sessionId, "Fix", ["Pass"]);
    for (let i = 0; i < 2; i++) {
      const goal = loops.get(sessionId)!;
      await loops.checkMonitored(sessionId, { revision: goal.revision, outcome: "continue", summary: `Attempt ${i}`, nextMessage: "Verify" }, undefined, keys);
      loops.finishTurn(sessionId);
    }
    vi.mocked(systemOne.evaluateDecision).mockResolvedValue(verdict(true, false));
    const goal = loops.get(sessionId)!;
    const completed = await loops.checkMonitored(sessionId, { revision: goal.revision, outcome: "complete", summary: "Verified", evidence: ["Test exit 0"] }, undefined, keys);
    expect(completed.status).toBe("completed");
    expect(loops.finishTurn(sessionId)?.status).toBe("completed");
  });

  it("routes configured tool checks through System One and waits for the verdict", async () => {
    const evaluate = vi.spyOn(systemOne, "evaluateDecision").mockResolvedValue(verdict(false));
    const user = sessions.create({ userId: "owner", name: "Monitored tool chat" });
    const goal = loops.goal(user.id, "Fix", ["Pass"], "owner");
    const tool = createLoopTools(loops).find(t => t.name === "loop.check")!;
    const result = await tool.execute({ revision: goal.revision, outcome: "complete", summary: "Done", evidence: ["Test exit 0"] },
      { sessionId: user.id, userId: "owner", actionId: "test", projectRoot: ".", requestedBy: "test", apiKeys: keys });
    expect(result).toMatchObject({ ok: true, data: { status: "running", monitor: { status: "rejected" } } });
    expect(evaluate).toHaveBeenCalledOnce();
  });

  it("requires a separate supported verdict for every acceptance criterion", async () => {
    const evaluate = vi.spyOn(systemOne, "evaluateDecision").mockResolvedValue(verdict());
    const goal = loops.goal(sessionId, "Fix", ["Tests pass", "Build passes"]);
    const result = await loops.checkMonitored(sessionId, { revision: goal.revision, outcome: "complete", summary: "Verified", evidence: ["Tests exit 0", "Build exit 0"] }, undefined, keys);
    expect(result).toMatchObject({ status: "running", monitor: { criteriaPassed: [true, false] } });
    expect(evaluate.mock.calls[0][2]).toHaveProperty("criterion_1");
  });

});
