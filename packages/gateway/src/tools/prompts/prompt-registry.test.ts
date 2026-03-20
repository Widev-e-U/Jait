import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./prompt-registry.js";
import "./index.js";

describe("buildSystemPrompt", () => {
  it("includes the shared Jait external provider instructions", () => {
    const prompt = buildSystemPrompt("agent", {
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
    }, {
      workspaceRoot: "/tmp/project",
    });

    expect(prompt).toContain("<jaitExternalProvider>");
    expect(prompt).toContain("You are operating inside Jait, a tool-centric coding workspace and gateway.");
    expect(prompt).toContain("Respect Jait workspace boundaries");
    expect(prompt).toContain("You are working in the workspace: /tmp/project");
  });
});
