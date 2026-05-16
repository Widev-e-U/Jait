import { describe, expect, it } from "vitest";
import { getSwarmModeInstructions } from "./shared-sections.js";

describe("shared prompt sections", () => {
  it("makes swarm mode use visible thread swarms", () => {
    const instructions = getSwarmModeInstructions();

    expect(instructions).toContain("thread.control");
    expect(instructions).toContain("create_many");
    expect(instructions).toContain("start: true");
    expect(instructions).toContain("kind: \"delegation\"");
    expect(instructions).toContain("UI shows a concrete thread swarm");
  });
});
