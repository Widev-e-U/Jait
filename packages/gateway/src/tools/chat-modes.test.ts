import { describe, expect, it } from "vitest";
import { getSystemPromptForMode } from "./chat-modes.js";

describe("chat mode prompts", () => {
  it("requires swarm mode to recommend and delegate through the agent tool as parallel sub-agents", () => {
    const prompt = getSystemPromptForMode("swarm");

    expect(prompt).toContain("agent tool");
    expect(prompt).toContain("concurrently");
    expect(prompt).toContain("allowedTools");
    expect(prompt).toContain("maxRounds");
    expect(prompt).toContain("recommend");
    expect(prompt).toContain("Tailor the lineup to the actual task");
  });
});
