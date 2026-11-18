import { describe, expect, it } from "vitest";
import { resolveCallNodeTarget } from "./remote-executor.js";

describe("resolveCallNodeTarget", () => {
  it("leaves ordinary calls untouched", () => {
    const input = { command: "pwd" };
    expect(resolveCallNodeTarget("terminal.run", input)).toEqual({
      nodeId: null,
      forcesLocal: false,
      input,
    });
  });

  it("pins a terminal call to another connected device", () => {
    const resolved = resolveCallNodeTarget("terminal.run", {
      command: "whoami",
      nodeId: "node-windows",
    });
    expect(resolved).toEqual({
      nodeId: "node-windows",
      forcesLocal: false,
      input: { command: "whoami" },
    });
  });

  it("treats gateway/local aliases as the gateway machine", () => {
    for (const alias of ["gateway", "local", "GATEWAY"]) {
      expect(resolveCallNodeTarget("terminal.run", { command: "pwd", nodeId: alias })).toEqual({
        nodeId: null,
        forcesLocal: true,
        input: { command: "pwd" },
      });
    }
  });

  it("rejects a device target on gateway-only tools instead of running locally", () => {
    const resolved = resolveCallNodeTarget("memory.search", { query: "notes", nodeId: "node-windows" });
    expect(resolved.nodeId).toBeNull();
    expect(resolved.error).toContain("cannot run on another device");
  });

  it("ignores a blank nodeId", () => {
    const input = { command: "pwd", nodeId: "   " };
    expect(resolveCallNodeTarget("terminal.run", input)).toEqual({
      nodeId: null,
      forcesLocal: false,
      input,
    });
  });
});
