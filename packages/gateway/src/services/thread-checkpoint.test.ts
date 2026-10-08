import { afterEach, describe, expect, it, vi } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { ThreadService } from "./threads.js";
import { buildThreadHistoryReplayPrompt } from "./thread-history.js";
import { routeThread } from "./thread-router.js";
import { ExecutionGuard } from "./execution-guard.js";

let opened: Awaited<ReturnType<typeof openDatabase>> | undefined;
afterEach(() => { opened?.sqlite.close(); opened = undefined; vi.restoreAllMocks(); });
describe("durable execution checkpoints", () => {
  it("keeps the original task, latest steering, branch, plan and limits beyond the activity tail", async () => {
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    const service = new ThreadService(opened.db);
    const thread = service.create({ title: "fixture", providerId: "jait", workingDirectory: "/tmp/project", branch: "delivery" });
    service.addActivity(thread.id, "message", "original", { role: "user", content: "Implement parser recovery." });
    service.addActivity(thread.id, "message", "steering", { role: "user", content: "Only change the parser; preserve the public API." });
    for (let i = 0; i < 2100; i++) service.addActivity(thread.id, "activity", `noise ${i}`);
    service.addActivity(thread.id, "message", "recovery", { role: "user", content: "The gateway process terminated during the previous turn.", recovery: true });
    service.addActivity(thread.id, "todo", "plan", { items: [{ title: "Run parser regression", status: "in-progress" }] });
    const guard = new ExecutionGuard(); guard.beforeCall(); guard.record("read", { ok: false, message: "Source chat not found" });
    service.addActivity(thread.id, "execution.checkpoint", "limits", guard.snapshot());
    const restored = new ThreadService(opened.db);
    const prompt = buildThreadHistoryReplayPrompt(restored, thread.id)!;
    expect(prompt).toContain("Implement parser recovery.");
    expect(prompt).toContain("Only change the parser; preserve the public API.");
    expect(prompt).toContain("branch: delivery");
    expect(prompt).toContain("Run parser regression");
    expect(restored.getExecutionCheckpoint(thread.id)?.calls).toBe(1);
    expect(restored.getTaskContext(thread.id).originalTask).toBe("Implement parser recovery.");
    expect(restored.getTaskContext(thread.id).latestInstruction).not.toContain("gateway process");
  });

  it("orders task anchors and checkpoints by insertion when timestamps are identical", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    opened = await openDatabase(":memory:"); migrateDatabase(opened.sqlite);
    const service = new ThreadService(opened.db);
    const thread = service.create({ title: "same millisecond", providerId: "jait" });
    service.addActivity(thread.id, "message", "original", { role: "user", content: "Original instruction" });
    service.addActivity(thread.id, "message", "steering", { role: "user", content: "Latest instruction" });
    service.addActivity(thread.id, "execution.checkpoint", "old", { calls: 1, windowCalls: 1, evidence: [], failures: {} });
    service.addActivity(thread.id, "execution.checkpoint", "new", { calls: 2, windowCalls: 2, evidence: [], failures: {} });
    for (let i = 0; i < 2001; i++) service.addActivity(thread.id, "activity", "noise");
    expect(service.getTaskContext(thread.id)).toEqual({ originalTask: "Original instruction", latestInstruction: "Latest instruction" });
    expect(service.getExecutionCheckpoint(thread.id)?.calls).toBe(2);
    const prompt = buildThreadHistoryReplayPrompt(service, thread.id)!;
    expect(prompt).toContain("Original task: Original instruction");
    expect(prompt).toContain("Latest instruction: Latest instruction");
  });

  it("does not select voice-call for generic recovery instructions", () => {
    const plan = routeThread({ message: "The gateway process terminated during the previous turn. Continue the unfinished task from the saved thread conversation, activity log and current workspace state. Verify completed tool calls before repeating actions.",
      availableSkills: [{ id: "voice-call", name: "voice-call", description: "Start voice calls via the OpenClaw voice-call plugin.", enabled: true } as any] });
    expect(plan.suggestedSkillIds).not.toContain("voice-call");
  });
});
