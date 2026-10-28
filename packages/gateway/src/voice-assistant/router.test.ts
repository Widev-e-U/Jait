import { describe, expect, it } from "vitest";
import { estimateDifficulty, planVoiceEscalation, resolveTierTarget } from "./router.js";
import { EMPTY_CATALOGUE, type VoiceModelCatalogue } from "./tier-catalog.js";

describe("estimateDifficulty", () => {
  it("scores small talk as trivially easy", () => {
    expect(estimateDifficulty("hey, how's it going").score).toBe(0);
  });

  it("scores one-fact lookups as easy", () => {
    expect(estimateDifficulty("what's the weather in Berlin").score).toBeLessThan(3);
  });

  it("scores diagnosis and comparisons as deep", () => {
    expect(estimateDifficulty("why is my build failing with a type error in the auth module").score).toBeGreaterThanOrEqual(3);
    expect(estimateDifficulty("compare postgres vs sqlite for this project and recommend one").score).toBeGreaterThanOrEqual(3);
  });

  it("recognises Jait state questions in the plural", () => {
    expect(estimateDifficulty("what are my open threads doing right now").signals.length).toBeGreaterThan(0);
  });
});

describe("planVoiceEscalation", () => {
  it("honours an explicit tier from the live model", async () => {
    const plan = await planVoiceEscalation({ question: "why is my build failing", explicitTier: "fast" });
    expect(plan).toMatchObject({ tier: "fast", source: "explicit" });
  });

  it("treats auto as unresolved and falls back to heuristics without System One", async () => {
    const plan = await planVoiceEscalation({
      question: "design the migration strategy for the voice escalation feature",
      explicitTier: "auto",
    });
    expect(plan.tier).toBe("deep");
    expect(plan.source).toBe("heuristic");
  });

  it("never fails on empty input", async () => {
    await expect(planVoiceEscalation({ question: "   " })).resolves.toMatchObject({ tier: "fast" });
  });
});

describe("tier targets", () => {
  const catalogue: VoiceModelCatalogue = {
    source: "backends",
    fast: [
      {
        providerId: "jait",
        model: "fixture-cheap",
        reasoningEfforts: [],
        costClass: "free",
        strengthClass: "small",
      },
    ],
    deep: [
      {
        providerId: "jait",
        model: "fixture-strong",
        reasoningEfforts: ["low", "medium", "high"],
        costClass: "premium",
        strengthClass: "strong",
      },
    ],
    builtAt: 0,
  };

  it("picks the cheapest usable model for the fast tier", () => {
    expect(resolveTierTarget("fast", catalogue)).toEqual({
      providerId: "jait",
      model: "fixture-cheap",
    });
  });

  it("picks the strongest model for the deep tier and asks for its deepest effort", () => {
    expect(resolveTierTarget("deep", catalogue)).toEqual({
      providerId: "jait",
      model: "fixture-strong",
      reasoningEffort: "high",
    });
  });

  it("falls back to thread defaults when the catalogue is empty", () => {
    expect(resolveTierTarget("deep", EMPTY_CATALOGUE)).toEqual({});
    expect(resolveTierTarget("fast")).toEqual({});
  });

  it("attaches a catalogue target to the route plan", async () => {
    const plan = await planVoiceEscalation({
      question: "why is my build failing",
      explicitTier: "deep",
      catalogue,
    });
    expect(plan.target).toEqual({
      providerId: "jait",
      model: "fixture-strong",
      reasoningEffort: "high",
    });
  });

  it("leaves the target empty when nothing is reachable", async () => {
    const plan = await planVoiceEscalation({ question: "why is my build failing", explicitTier: "deep" });
    expect(plan.target).toBeUndefined();
  });
});
