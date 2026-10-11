import { describe, expect, it, vi } from "vitest";
import { ToolRegistry } from "../tools/registry.js";
import { ConsentAwareExecutor } from "./consent-executor.js";
import { ConsentManager } from "./consent-manager.js";
import { TrustEngine } from "./trust-engine.js";
import { getProfile, listProfiles } from "./tool-profiles.js";

describe("supervised tool discovery consent", () => {
  it.each(listProfiles().flatMap(profile => ["tools.search", "tools.list"].map(tool => ({ profile, tool }))))(
    "$profile: $tool executes without requiring approval",
    async ({ profile, tool }) => {
      const registry = new ToolRegistry();
      const run = vi.fn(async () => ({ ok: true, message: "Schemas found", data: { matches: [] } }));
      registry.register({
        name: tool, description: "Read available tool schemas", tier: "core", category: "meta", source: "builtin",
        parameters: { type: "object", properties: {} }, execute: run,
      });
      const manager = new ConsentManager({ defaultTimeoutMs: 1 });
      const request = vi.spyOn(manager, "requestConsent");
      const executor = new ConsentAwareExecutor({
        toolRegistry: registry, consentManager: manager, trustEngine: new TrustEngine(),
        permissions: getProfile(profile), sessionApprovals: new Set(), profileName: profile,
      });
      const result = await executor.execute(tool, {}, {
        sessionId: "supervised-persona-thread", actionId: "discovery", projectRoot: "/project",
        requestedBy: "mcp-client", runtimeMode: "supervised",
      }, { consentTimeoutMs: 1 });
      expect(result.ok).toBe(true);
      expect(run).toHaveBeenCalledTimes(1);
      expect(request).not.toHaveBeenCalled();
    },
  );

  it("keeps unknown tools consent-sensitive", async () => {
    const executor = new ConsentAwareExecutor({
      toolRegistry: new ToolRegistry(), consentManager: new ConsentManager(), trustEngine: new TrustEngine(),
      permissions: getProfile("coding"), sessionApprovals: new Set(), profileName: "coding",
    });
    const plan = await executor.execute("new.unknown-tool", {}, {
      sessionId: "supervised-persona-thread", actionId: "unknown", projectRoot: "/project", requestedBy: "mcp-client",
      runtimeMode: "supervised",
    }, { dryRun: true });
    expect(plan.data).toMatchObject({
      requiresConsent: true, risk: "high", policy: { consentLevel: "dangerous", knownTool: false },
    });
  });
});
