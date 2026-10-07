import { describe, expect, it } from "vitest";
import { buildThreadHistoryReplayPrompt } from "./thread-history.js";
import type { ThreadService } from "./threads.js";

describe("thread history continuation", () => {
  it("keeps the original task and recent progress after many continuation turns", () => {
    const activities = Array.from({ length: 40 }, (_, index) => ({
      id: String(index), threadId: "work", kind: "message", summary: "",
      createdAt: new Date(index * 1000).toISOString(),
      payload: { role: index === 0 ? "user" : "assistant", content: index === 0 ? "Repair parser; preserve API compatibility." : index === 39 ? "Remaining: verify parser tests." : "Intermediate progress ".repeat(100) },
    }));
    const service = { getActivities: () => activities } as unknown as ThreadService;
    const prompt = buildThreadHistoryReplayPrompt(service, "work")!;
    expect(prompt).toContain("Repair parser; preserve API compatibility.");
    expect(prompt).toContain("Remaining: verify parser tests.");
    expect(prompt.length).toBeLessThan(13_000);
  });
});
