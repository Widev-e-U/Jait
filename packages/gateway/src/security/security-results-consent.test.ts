import { expect, it, vi } from "vitest";
import { ToolRegistry } from "../tools/registry.js";
import { createSecurityWorkbenchTools } from "../tools/security-workbench-tools.js";
import { getSecurityWorkbench } from "./workbench.js";
import { ConsentAwareExecutor } from "./consent-executor.js";
import { ConsentManager } from "./consent-manager.js";
import { TrustEngine } from "./trust-engine.js";
import { extendProfile, getProfile } from "./tool-profiles.js";

it.each(["minimal", "coding", "full"] as const)("displays owned saved evidence through the %s consent profile", async profile => {
  const service = getSecurityWorkbench();
  const get = vi.spyOn(service, "get").mockImplementation((id, owner) => {
    if (owner !== "saved-owner") throw new Error("Security check not found");
    return { id, status: "completed", findings: [], evidence: [] } as ReturnType<typeof service.get>;
  });
  const start = vi.spyOn(service, "start");
  const registry = new ToolRegistry();
  registry.register(createSecurityWorkbenchTools().find(tool => tool.name === "security.results.show")!);
  const manager = new ConsentManager({ defaultTimeoutMs: 5000 });
  const executor = new ConsentAwareExecutor({
    toolRegistry: registry, consentManager: manager, trustEngine: new TrustEngine(),
    permissions: getProfile(profile), sessionApprovals: new Set(), profileName: profile,
  });
  try {
    const result = await executor.execute("security.results.show", { runId: "saved-run" }, {
      userId: "saved-owner", sessionId: "saved-session", actionId: "show", requestedBy: "test", projectRoot: process.cwd(),
    });
    expect(result).toMatchObject({ ok: true, data: { id: "saved-run" } });
    expect(manager.pendingCount).toBe(0);
    expect(get).toHaveBeenCalledWith("saved-run", "saved-owner");
    expect(start).not.toHaveBeenCalled();
  } finally { vi.restoreAllMocks(); }
});

it("preserves explicit approval restrictions on displaying saved evidence", async () => {
  const service = getSecurityWorkbench();
  const get = vi.spyOn(service, "get").mockReturnValue({ id: "saved-run" } as ReturnType<typeof service.get>);
  const registry = new ToolRegistry();
  registry.register(createSecurityWorkbenchTools().find(tool => tool.name === "security.results.show")!);
  const manager = new ConsentManager({ defaultTimeoutMs: 5000 });
  const executor = new ConsentAwareExecutor({
    toolRegistry: registry, consentManager: manager, trustEngine: new TrustEngine(),
    permissions: extendProfile("coding", [{ toolName: "security.results.show", consentLevel: "dangerous", risk: "high", description: "Explicit user restriction" }]),
    sessionApprovals: new Set(), profileName: "coding",
  });
  try {
    const pending = executor.execute("security.results.show", { runId: "saved-run" }, {
      userId: "saved-owner", sessionId: "restricted-session", actionId: "show", requestedBy: "test", projectRoot: process.cwd(),
    });
    expect(manager.pendingCount).toBe(1);
    expect(get).not.toHaveBeenCalled();
    manager.reject(manager.listPending()[0]!.id, "click", "User restriction");
    expect((await pending).ok).toBe(false);
    expect(get).not.toHaveBeenCalled();
  } finally { vi.restoreAllMocks(); }
});
