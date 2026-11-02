import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveBrowserModel, workflowStepFromStagehand } from "./browser-intelligence.js";
import type { ToolContext } from "../tools/contracts.js";

const context: ToolContext = { sessionId: "chat", actionId: "test", projectRoot: "/project", requestedBy: "test" };
afterEach(() => vi.unstubAllEnvs());
describe("Stagehand action compatibility", () => {
  const click = { description: "Submit", selector: "xpath=/html[1]/body[1]/button[1]", method: "click", arguments: [] };
  it("converts replayable selectors without changing their meaning", () => {
    expect(workflowStepFromStagehand(click)).toEqual({ action: "click", label: "Submit", selector: click.selector });
    expect(workflowStepFromStagehand({ ...click, method: "fill", arguments: ["{{month}}"] })).toMatchObject({ action: "type", text: "{{month}}" });
    expect(workflowStepFromStagehand({ ...click, method: "selectOption", arguments: ["paid"] })).toMatchObject({ action: "select", value: "paid" });
  });
  it("rejects unsupported methods, frame chains and malformed actions", () => {
    for (const patch of [{ method: "evaluate" }, { method: "press", arguments: ["Enter"] }, { selector: "iframe >> xpath=/html/body/button" },
      { method: "click", arguments: ["dangerous option"] }, { arguments: [{ script: "x" }] }, { selector: "" }]) {
      expect(workflowStepFromStagehand({ ...click, ...patch })).toBeNull();
    }
  });
  it("uses configured account keys and never infers API access from a CLI subscription", () => {
    for (const key of ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "BROWSER_STAGEHAND_MODEL"]) vi.stubEnv(key, "");
    expect(() => resolveBrowserModel(context)).toThrow("API key");
    expect(resolveBrowserModel({ ...context, apiKeys: { OPENAI_API_KEY: "test-key" } })).toMatchObject({ modelName: "openai/gpt-4.1-mini", apiKey: "test-key" });
    vi.stubEnv("BROWSER_STAGEHAND_MODEL", "anthropic/custom");
    expect(() => resolveBrowserModel({ ...context, apiKeys: { OPENAI_API_KEY: "test-key" } })).toThrow("API key");
    expect(resolveBrowserModel({ ...context, apiKeys: { ANTHROPIC_API_KEY: "other" } })).toMatchObject({ modelName: "anthropic/custom", apiKey: "other" });
  });
});
