import { describe, expect, it } from "vitest";
import { JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS, JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS_LITE, getSwarmModeInstructions } from "./shared-sections.js";

describe("shared prompt sections", () => {
  it("makes swarm mode recommend and delegate through the agent tool as parallel sub-agents", () => {
    const instructions = getSwarmModeInstructions();

    expect(instructions).toContain("agent tool");
    expect(instructions).toContain("concurrently");
    expect(instructions).toContain("independent sub-agents");
    expect(instructions).toContain("allowedTools");
    expect(instructions).toContain("recommend");
  });

  it("defines explicit memory-save heuristics", () => {
    expect(JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS).toContain("stable user preferences");
    expect(JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS).toContain("durable project facts");
    expect(JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS).toContain("repeated corrections");
    expect(JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS).toContain("Avoid saving transient chat details");
    expect(JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS_LITE).toContain("Save only durable memories");
  });
});
