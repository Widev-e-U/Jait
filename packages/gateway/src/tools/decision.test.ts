import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../services/system-one.js", () => ({ evaluateDecision: vi.fn() }));
import { evaluateDecision } from "../services/system-one.js";
import { createDecisionEvaluateTool } from "./decision.js";
const context = { sessionId: "decision-tests", actionId: "decision-action", projectRoot: "/project", requestedBy: "test", apiKeys: { SYSTEM_ONE_MODEL: "fixture-model" }, signal: new AbortController().signal };
beforeEach(() => { vi.mocked(evaluateDecision).mockReset(); });
describe("decision.evaluate", () => {
  it("evaluates bounded choices, scores and probabilities with cancellation", async () => {
    const output = { answers: { route: "browser", confidence: 2, ready: 0.9 } };
    vi.mocked(evaluateDecision).mockResolvedValue(output as never);
    const result = await createDecisionEvaluateTool().execute({ state: "Local fixture ready", questions: [
      { id: "route", type: "choice", instructions: "Choose a route", options: [{ id: "browser", description: "Browser" }, { id: "terminal", description: "Terminal" }] },
      { id: "confidence", type: "score", instructions: "Score confidence", levels: ["Low", "High"] },
      { id: "ready", type: "noul", instructions: "Is the fixture ready?" },
    ] }, context);
    expect(result).toMatchObject({ ok: true, data: output });
    expect(evaluateDecision).toHaveBeenCalledWith(context.apiKeys, "Local fixture ready", {
      route: { type: "choice", instructions: "Choose a route", criteria: { browser: "Browser", terminal: "Terminal" } },
      confidence: { type: "score", instructions: "Score confidence", criteria: ["Low", "High"] },
      ready: { type: "noul", instructions: "Is the fixture ready?" },
    }, context.signal);
  });
  it("rejects duplicate question IDs before contacting the model", async () => {
    const question = { id: "ready", type: "noul" as const, instructions: "Ready?" };
    expect((await createDecisionEvaluateTool().execute({ state: "Fixture", questions: [question, question] }, context)).ok).toBe(false);
    expect(evaluateDecision).not.toHaveBeenCalled();
  });
  it("reports model failure without exposing backend details", async () => {
    vi.mocked(evaluateDecision).mockRejectedValue(new Error("backend-private-details"));
    const result = await createDecisionEvaluateTool().execute({ state: "Fixture", questions: [{ id: "ready", type: "noul", instructions: "Ready?" }] }, context);
    expect(result.ok).toBe(false);
    expect(result.message).not.toContain("backend-private-details");
  });
});
