import { describe, expect, it } from "vitest";
import { ChatLoopSchema, readChatLoop } from "./chat-loop.js";

const loop = { id: "loop", goal: "Verify fix", criteria: ["Checks pass"], status: "running", iteration: 0, revision: 0, checkedIteration: -1, summary: "", nextMessage: "", evidence: [], updatedAt: "2026-10-25T00:00:00Z" };
const monitor = { status: "accepted", reviewedRevision: 0, reviewedAt: loop.updatedAt, criteriaPassed: [true], progress: "progress", reason: "Checks passed", model: "test" };
describe("persisted chat loops", () => {
  it("reads older rows and monitored rows from objects and JSON", () => {
    expect(readChatLoop({ loop })).toEqual(loop);
    const monitored = { ...loop, budgetStartIteration: 0, stalledChecks: 0, uncheckedTurns: 1, monitor };
    expect(readChatLoop(JSON.stringify({ loop: monitored }))).toEqual(monitored);
  });
  it.each([null, {}, "bad json", { loop: { ...loop, iteration: -1 } }])("rejects malformed metadata %j", metadata => {
    expect(readChatLoop(metadata)).toBeNull();
  });
  it("validates monitor limits and status", () => {
    expect(ChatLoopSchema.safeParse({ ...loop, monitor: { ...monitor, criteriaPassed: Array(21).fill(true) } }).success).toBe(false);
    expect(ChatLoopSchema.safeParse({ ...loop, monitor: { ...monitor, status: "made-up" } }).success).toBe(false);
  });
});
