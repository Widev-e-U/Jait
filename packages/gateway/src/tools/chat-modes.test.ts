import { describe, expect, it } from "vitest";
import { getSystemPromptForMode, SWARM_TEAMS, formatSwarmTeamsRoster } from "./chat-modes.js";

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

  it("offers a named roster of built-in teams and allows inventing a custom one", () => {
    const prompt = getSystemPromptForMode("swarm");

    expect(prompt).toContain("Developer Team");
    expect(prompt).toContain("Research Team");
    expect(prompt).toContain("Content Team");
    expect(prompt).toContain("Security Team");
    expect(prompt).toContain("Ops Team");
    expect(prompt).toContain("invent a new one");
    expect(prompt).toContain(formatSwarmTeamsRoster());
    expect(SWARM_TEAMS.every((team) => team.roles.length > 0)).toBe(true);
  });

  it("has agent mode honor an explicit request to solve the task as a team, without requiring a mode switch", () => {
    const prompt = getSystemPromptForMode("agent");

    expect(prompt).toContain("as a team");
    expect(prompt).toContain("agent tool");
    expect(prompt).toContain("concurrently");
    expect(prompt).toContain("Don't wait for the user to switch to Swarm mode");
  });
});
