import { describe, expect, it } from "vitest";
import { JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS, JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS_LITE, getSwarmModeInstructions } from "./shared-sections.js";

describe("shared prompt sections", () => {
  it("makes swarm mode deploy a task-appropriate team of specialist sub-agents", () => {
    const instructions = getSwarmModeInstructions();

    expect(instructions).toContain("agent tool");
    expect(instructions).toContain("concurrently");
    expect(instructions).toContain("independent sub-agents");
    expect(instructions).toContain("allowedTools");
    expect(instructions).toContain("Research Specialist");
    expect(instructions).toContain("Testing Specialist");
    expect(instructions).toContain("Validation Specialist");
    expect(instructions).toContain("reuse the same lineup for every task");
  });

  it("offers a named roster of built-in teams and allows inventing a custom one", () => {
    const instructions = getSwarmModeInstructions();

    expect(instructions).toContain("Developer Team");
    expect(instructions).toContain("Research Team");
    expect(instructions).toContain("Content Team");
    expect(instructions).toContain("Security Team");
    expect(instructions).toContain("Ops Team");
    expect(instructions).toContain("invent a new named team");
  });

  it("defines explicit memory-save heuristics", () => {
    expect(JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS).toContain("stable user preferences");
    expect(JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS).toContain("durable project facts");
    expect(JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS).toContain("repeated corrections");
    expect(JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS).toContain("Avoid saving transient chat details");
    expect(JAIT_EXTERNAL_PROVIDER_INSTRUCTIONS_LITE).toContain("Save only durable memories");
  });
});
