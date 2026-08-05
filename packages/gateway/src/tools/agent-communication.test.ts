import { describe, expect, it } from "vitest";
import { describePerformative, isSuccessfulPerformative, parsePerformative } from "./agent-communication.js";

describe("parsePerformative", () => {
  it("defaults to inform when no tag is present", () => {
    expect(parsePerformative("Here are the results.")).toEqual({
      performative: "inform",
      content: "Here are the results.",
    });
  });

  it("parses each recognized tag and strips it from the content", () => {
    expect(parsePerformative("[REFUSE] This is out of scope.")).toEqual({
      performative: "refuse",
      content: "This is out of scope.",
    });
    expect(parsePerformative("[FAILURE] Could not reproduce the crash.")).toEqual({
      performative: "failure",
      content: "Could not reproduce the crash.",
    });
    expect(parsePerformative("[PROPOSE] Option A or Option B.")).toEqual({
      performative: "propose",
      content: "Option A or Option B.",
    });
    expect(parsePerformative("[QUERY] Which environment should I target?")).toEqual({
      performative: "query",
      content: "Which environment should I target?",
    });
    expect(parsePerformative("[AGREE] Starting now.")).toEqual({
      performative: "agree",
      content: "Starting now.",
    });
  });

  it("is case-insensitive and tolerates surrounding whitespace", () => {
    expect(parsePerformative("  [inform]   Done.")).toEqual({
      performative: "inform",
      content: "Done.",
    });
  });

  it("ignores a tag that isn't at the very start", () => {
    expect(parsePerformative("Summary: [INFORM] done")).toEqual({
      performative: "inform",
      content: "Summary: [INFORM] done",
    });
  });
});

describe("isSuccessfulPerformative", () => {
  it("treats inform and agree as successful", () => {
    expect(isSuccessfulPerformative("inform")).toBe(true);
    expect(isSuccessfulPerformative("agree")).toBe(true);
  });

  it("treats refuse, failure, and query as unsuccessful", () => {
    expect(isSuccessfulPerformative("refuse")).toBe(false);
    expect(isSuccessfulPerformative("failure")).toBe(false);
    expect(isSuccessfulPerformative("query")).toBe(false);
  });
});

describe("describePerformative", () => {
  it("returns a human-readable label for every performative", () => {
    expect(describePerformative("inform")).toBe("Reported results");
    expect(describePerformative("propose")).toBe("Proposed options for a decision");
    expect(describePerformative("refuse")).toBe("Declined the task");
    expect(describePerformative("failure")).toBe("Attempted but failed");
    expect(describePerformative("query")).toBe("Needs clarification");
    expect(describePerformative("agree")).toBe("Accepted the task");
  });
});
