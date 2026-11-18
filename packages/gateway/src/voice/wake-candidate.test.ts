import { beforeEach, describe, expect, it, vi } from "vitest";
import { isWakeCandidate } from "./wake-candidate.js";

const systemOne = vi.hoisted(() => ({ evaluate: vi.fn(), enabled: vi.fn() }));
vi.mock("../services/system-one.js", () => ({
  evaluateDecision: systemOne.evaluate,
  systemOneEnabled: systemOne.enabled,
}));

beforeEach(() => {
  systemOne.evaluate.mockReset();
  systemOne.enabled.mockReset().mockReturnValue(true);
});

describe("ambiguous wake-word review", () => {
  it("accepts only a high-confidence yes for a candidate address", async () => {
    systemOne.evaluate.mockResolvedValue({ answers: { address: { choice: "yes", confidence: 0.95 } } });
    expect(await isWakeCandidate("Hey Jay, what's on my calendar?", {}, new AbortController().signal)).toBe(true);
    expect(systemOne.evaluate.mock.calls[0]?.[1]).toContain("Hey Jay");
  });
  it("does not send unrelated transcripts to the model", async () => {
    expect(await isWakeCandidate("the date is tomorrow", {}, new AbortController().signal)).toBe(false);
    expect(await isWakeCandidate("Hey Jade, help", {}, new AbortController().signal)).toBe(false);
    expect(systemOne.evaluate).not.toHaveBeenCalled();
  });
  it("fails closed when confidence is low, the model is unavailable, or it is not configured", async () => {
    systemOne.evaluate.mockResolvedValueOnce({ answers: { address: { choice: "yes", confidence: 0.7 } } });
    systemOne.evaluate.mockRejectedValueOnce(new Error("timeout"));
    expect(await isWakeCandidate("Hey Jay, help", {}, new AbortController().signal)).toBe(false);
    expect(await isWakeCandidate("Hey Jay, help", {}, new AbortController().signal)).toBe(false);
    systemOne.enabled.mockReturnValue(false);
    expect(await isWakeCandidate("Hey Jay, help", {}, new AbortController().signal)).toBe(false);
    expect(systemOne.evaluate).toHaveBeenCalledTimes(2);
  });
});
