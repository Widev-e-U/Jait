import { describe, expect, it } from "vitest";
import { getSystemPromptForMode } from "./chat-modes.js";

describe("chat mode prompts", () => {
  it("requires swarm mode to start visible specialist threads", () => {
    const prompt = getSystemPromptForMode("swarm");

    expect(prompt).toContain("thread.control");
    expect(prompt).toContain("create_many");
    expect(prompt).toContain("start: true");
    expect(prompt).toContain("kind: \"delegation\"");
    expect(prompt).toContain("detach: false");
  });
});
