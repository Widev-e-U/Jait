import { describe, expect, it } from "vitest";
import { NodeStateManager } from "./node-state-manager.js";

describe("NodeStateManager gateway update metadata", () => {
  it("retains advertised version and update capability through filesystem registration", () => {
    const nodes = new NodeStateManager();
    const identity = { id: "remote", name: "Remote", platform: "linux" as const, role: "remote" as const, clientId: "client" };
    nodes.upsertNode({ ...identity, appVersion: "1.2.3", capabilities: { gatewayUpdate: true } });
    const registered = nodes.upsertNode({ ...identity, capabilities: { surfaces: ["filesystem"] } });
    expect(registered.appVersion).toBe("1.2.3");
    expect(registered.capabilities.gatewayUpdate).toBe(true);
    expect(registered.capabilities.surfaces).toContain("filesystem");
  });

  it("clears advertised update authority when a different connection registers the same node", () => {
    const nodes = new NodeStateManager();
    const identity = { id: "remote", name: "Remote", platform: "linux" as const, role: "remote" as const };
    nodes.upsertNode({ ...identity, clientId: "old", appVersion: "1.2.3", capabilities: { gatewayUpdate: true } });
    const replacement = nodes.upsertNode({ ...identity, clientId: "new" });
    expect(replacement.appVersion).toBeUndefined();
    expect(replacement.capabilities.gatewayUpdate).toBe(false);
  });

  it("does not advertise updates for older nodes", () => {
    const nodes = new NodeStateManager();
    const node = nodes.upsertNode({ id: "old", name: "Old", platform: "linux", role: "remote", clientId: "client" });
    expect(node.appVersion).toBeUndefined();
    expect(node.capabilities.gatewayUpdate).toBe(false);
  });
});
