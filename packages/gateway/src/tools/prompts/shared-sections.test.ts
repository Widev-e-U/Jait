import { describe, expect, it } from "vitest";
import { JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS, JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS_LITE, getSwarmModeInstructions } from "./shared-sections.js";

describe("shared prompt sections", () => {
  it("makes swarm mode use visible thread swarms", () => {
    const instructions = getSwarmModeInstructions();

    expect(instructions).toContain("thread.control");
    expect(instructions).toContain("create_many");
    expect(instructions).toContain("start: true");
    expect(instructions).toContain("kind: \"delegation\"");
    expect(instructions).toContain("UI shows a concrete thread swarm");
  });

  it("defines explicit memory-save heuristics", () => {
    expect(JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS).toContain("stable user preferences");
    expect(JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS).toContain("durable project facts");
    expect(JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS).toContain("repeated corrections");
    expect(JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS).toContain("Avoid saving transient chat details");
    expect(JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS_LITE).toContain("Save only durable memories");
  });
});
