import { describe, expect, it } from "vitest";
import { assertTaskTransition, canTransitionTask, deriveRunStatus, InvalidTaskTransitionError } from "./state-machine.js";

describe("task transitions", () => {
  it("allows the documented paths", () => {
    expect(canTransitionTask("pending", "ready")).toBe(true);
    expect(canTransitionTask("ready", "running")).toBe(true);
    expect(canTransitionTask("running", "verifying")).toBe(true);
    expect(canTransitionTask("verifying", "passed")).toBe(true);
    expect(canTransitionTask("verifying", "ready")).toBe(true);
    expect(canTransitionTask("failed", "ready")).toBe(true);
    expect(canTransitionTask("interrupted", "ready")).toBe(true);
  });

  it("rejects shortcuts that would skip verification or inspection", () => {
    expect(canTransitionTask("running", "passed")).toBe(false);
    expect(canTransitionTask("pending", "running")).toBe(false);
    expect(canTransitionTask("interrupted", "passed")).toBe(false);
    expect(() => assertTaskTransition("passed", "ready")).toThrow(InvalidTaskTransitionError);
  });

  it("keeps passed and cancelled final", () => {
    for (const to of ["ready", "running", "failed", "pending", "blocked"] as const) {
      expect(canTransitionTask("passed", to)).toBe(false);
      expect(canTransitionTask("cancelled", to)).toBe(false);
    }
  });
});

describe("deriveRunStatus", () => {
  it("finishes only when every task passed", () => {
    expect(deriveRunStatus(["passed", "passed"])).toBe("passed");
    expect(deriveRunStatus(["passed", "ready"])).toBe("running");
  });

  it("prefers active work, then interruptions, then failures", () => {
    expect(deriveRunStatus(["running", "failed"])).toBe("running");
    expect(deriveRunStatus(["interrupted", "passed"])).toBe("interrupted");
    expect(deriveRunStatus(["blocked", "passed"])).toBe("failed");
  });

  it("reports cancelled when work was cancelled without failures", () => {
    expect(deriveRunStatus(["passed", "cancelled"])).toBe("cancelled");
  });
});
