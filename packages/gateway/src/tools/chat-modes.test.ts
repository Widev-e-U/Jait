import { describe, expect, it } from "vitest";
import { getSystemPromptForMode } from "./chat-modes.js";

describe("chat mode prompts", () => {
  it("requires swarm mode to deploy a task-appropriate team of specialist sub-agents", () => {
    const prompt = getSystemPromptForMode("swarm");

    expect(prompt).toContain("agent tool");
    expect(prompt).toContain("concurrently");
    expect(prompt).toContain("allowedTools");
    expect(prompt).toContain("maxRounds");
    expect(prompt).toContain("Research Specialist");
    expect(prompt).toContain("Testing Specialist");
    expect(prompt).toContain("Validation Specialist");
    expect(prompt).toContain("tailor the lineup");
  });
});
