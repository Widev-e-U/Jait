import { describe, expect, it } from "vitest";
import { nodeCapabilityForTool } from "./ws.js";

describe("computer node capability routing", () => {
  it("requires input for control, screen for observation, and always permits stop", () => {
    expect(nodeCapabilityForTool("computer.session", { action: "start" })).toBe("input");
    expect(nodeCapabilityForTool("computer.act", { action: "click" })).toBe("input");
    expect(nodeCapabilityForTool("computer.observe", {})).toBe("screen");
    expect(nodeCapabilityForTool("computer.session", { action: "stop" })).toBeUndefined();
  });
});
