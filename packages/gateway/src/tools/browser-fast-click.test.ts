import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserInteractionTools } from "./browser-tools.js";
import { ToolRegistry } from "./registry.js";
import type { ToolContext } from "./contracts.js";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import { evaluateDecision, systemOneEnabled } from "../services/system-one.js";
import { ConsentAwareExecutor } from "../security/consent-executor.js";
import { ConsentManager } from "../security/consent-manager.js";
import { TrustEngine } from "../security/trust-engine.js";
import type { ToolPermission } from "../security/tool-permissions.js";

vi.mock("../services/system-one.js", () => ({ evaluateDecision: vi.fn(), systemOneEnabled: vi.fn(), rankSystemOne: vi.fn() }));
const context: ToolContext = { sessionId: "chat", actionId: "test", projectRoot: "/project", requestedBy: "test", apiKeys: { SYSTEM_ONE_BASE_URL: "http://model" } };
const selected = { model: "fixture", answers: { target: { type: "choice" as const, choice: "c0", confidence: 0.95 } } };
const snapshot = {
  url: "https://example.test/page", documentUrl: "https://example.test/page", documentTimeOrigin: 12345, title: "Private title", text: "private page contents",
  elements: [
    { role: "button", tagName: "button", name: "Settings", text: "Settings", value: "private field value", selectors: [{ kind: "id" as const, value: "settings", selector: "#settings" }] },
    { role: "button", tagName: "button", name: "Delete account", text: "Delete account", selectors: [{ kind: "id" as const, value: "delete", selector: "#delete" }] },
  ],
};
function fixture() {
  const browser = { id: "browser-chat", type: "browser", state: "running", sessionId: "chat", inspect: vi.fn(async () => ({ snapshot })), fastClickSnapshot: vi.fn(async () => snapshot), click: vi.fn(async (..._args: unknown[]) => {}) };
  const session = { id: "chat", sessionId: "chat", browserId: browser.id, controller: "agent", secretSafe: false };
  let lost: ((id: string) => void) | undefined;
  const collaboration = {
    getSessionByPreviewSessionId: () => session,
    getSessionByBrowserId: () => session,
    assertAgentControl: vi.fn(() => { if (session.controller !== "agent") throw new Error("not shared"); }),
    onBrowserControlLost: (fn: (id: string) => void) => { lost = fn; return () => { lost = undefined; }; },
  };
  const registry = { getSurface: () => browser } as unknown as SurfaceRegistry;
  const tool = createBrowserInteractionTools(registry, collaboration).find(t => t.name === "browser.click")!;
  return { browser, session, tool, loseControl: () => { session.controller = "user"; lost?.(browser.id); } };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(systemOneEnabled).mockReturnValue(true);
  vi.mocked(evaluateDecision).mockResolvedValue(selected);
});

describe("System One browser clicks", () => {
  it("uses the existing click tool and sends only matching labels to the model", async () => {
    const f = fixture();
    const result = await f.tool.execute({ target: "Open Settings" }, context);
    expect(result).toMatchObject({ ok: true, data: { actionResult: { selector: "#settings", resolvedBy: "system-one" } } });
    expect(f.browser.click).toHaveBeenCalledWith("#settings", expect.any(AbortSignal), {
      documentUrl: snapshot.documentUrl, documentTimeOrigin: snapshot.documentTimeOrigin, tagName: "button", name: "Settings", text: "Settings",
    });
    const request = JSON.stringify(vi.mocked(evaluateDecision).mock.calls[0]);
    expect(request).toContain("Settings");
    expect(request).not.toContain("private page contents");
    expect(request).not.toContain("private field value");
    expect(request).not.toContain("Delete account");
    expect(request).not.toContain("example.test");
  });

  it("keeps explicit selectors working without System One", async () => {
    const f = fixture();
    vi.mocked(systemOneEnabled).mockReturnValue(false);
    expect(await f.tool.execute({ selector: "#settings" }, context)).toMatchObject({ ok: true });
    expect(f.browser.click).toHaveBeenCalledWith("#settings", undefined);
    expect(evaluateDecision).not.toHaveBeenCalled();
  });

  it("requires an explicit complete label and refuses ambiguous or unconfigured targets", async () => {
    const f = fixture();
    await expect(f.tool.execute({ target: "Open account" }, context)).rejects.toThrow("complete label");
    const duplicate = { ...snapshot, elements: [snapshot.elements[0], snapshot.elements[0]] };
    f.browser.fastClickSnapshot.mockResolvedValueOnce(duplicate);
    await expect(f.tool.execute({ target: "Open Settings" }, context)).rejects.toThrow("ambiguous");
    const overlapping = { ...snapshot, elements: [snapshot.elements[0], { ...snapshot.elements[0], name: "Account Settings", text: "Account Settings" }] };
    f.browser.fastClickSnapshot.mockResolvedValueOnce(overlapping);
    await expect(f.tool.execute({ target: "Open Account Settings" }, context)).rejects.toThrow("ambiguous");
    const longLabel = "x".repeat(200);
    const truncated = { ...snapshot, elements: [{ ...snapshot.elements[0], name: longLabel, text: longLabel }] };
    f.browser.fastClickSnapshot.mockResolvedValueOnce(truncated);
    await expect(f.tool.execute({ target: `Click ${longLabel}` }, context)).rejects.toThrow("complete label");
    vi.mocked(systemOneEnabled).mockReturnValue(false);
    await expect(f.tool.execute({ target: "Open Settings" }, context)).rejects.toThrow("not configured");
    await expect(f.tool.execute({ target: "Open Settings", selector: "#settings" }, context)).rejects.toThrow("exactly one");
    expect(f.browser.click).not.toHaveBeenCalled();
    expect(evaluateDecision).not.toHaveBeenCalled();
  });

  it("stops when the model abstains, is uncertain, fails, or is cancelled", async () => {
    const f = fixture();
    vi.mocked(evaluateDecision).mockResolvedValueOnce({ model: "fixture", answers: { target: { type: "choice", choice: "none" } } });
    await expect(f.tool.execute({ target: "Open Settings" }, context)).rejects.toThrow("confidently");
    vi.mocked(evaluateDecision).mockResolvedValueOnce({ model: "fixture", answers: { target: { type: "choice", choice: "c0", confidence: 0.2 } } });
    await expect(f.tool.execute({ target: "Open Settings" }, context)).rejects.toThrow("confidently");
    vi.mocked(evaluateDecision).mockRejectedValueOnce(new Error("unavailable"));
    await expect(f.tool.execute({ target: "Open Settings" }, context)).rejects.toThrow("unavailable");
    const controller = new AbortController();
    controller.abort();
    expect(await f.tool.execute({ target: "Open Settings" }, { ...context, signal: controller.signal })).toMatchObject({ ok: false });
    expect(f.browser.click).not.toHaveBeenCalled();
  });

  it("never starts inference in secret-safe or user-controlled sessions", async () => {
    const f = fixture();
    f.session.secretSafe = true;
    await expect(f.tool.execute({ target: "Open Settings" }, context)).rejects.toThrow("secret-safe");
    f.session.secretSafe = false;
    f.session.controller = "user";
    await expect(f.tool.execute({ target: "Open Settings" }, context)).rejects.toThrow("not shared");
    expect(evaluateDecision).not.toHaveBeenCalled();
    expect(f.browser.click).not.toHaveBeenCalled();
  });

  it.each(["privacy", "control"])("does not click when %s changes during inference", async change => {
    const f = fixture();
    vi.mocked(evaluateDecision).mockImplementationOnce(async () => {
      if (change === "privacy") f.session.secretSafe = true;
      else f.loseControl();
      return selected;
    });
    await expect(f.tool.execute({ target: "Open Settings" }, context)).rejects.toThrow();
    expect(f.browser.click).not.toHaveBeenCalled();
  });

  it("reports a completed click even if control is taken afterward", async () => {
    const f = fixture();
    f.browser.click.mockImplementationOnce(async () => { f.loseControl(); });
    expect(await f.tool.execute({ target: "Open Settings" }, context)).toMatchObject({ ok: true });
    expect(f.browser.fastClickSnapshot).toHaveBeenCalledTimes(1);
    expect(f.browser.inspect).not.toHaveBeenCalled();
  });

  it("uses the existing browser.click consent policy before inference or action", async () => {
    const f = fixture();
    const tools = new ToolRegistry();
    tools.register(f.tool);
    const consent = new ConsentManager({ defaultTimeoutMs: 5000 });
    const permissions = new Map<string, ToolPermission>([["browser.click", { toolName: "browser.click", consentLevel: "always", risk: "low", description: "Click" }]]);
    const executor = new ConsentAwareExecutor({ toolRegistry: tools, consentManager: consent, trustEngine: new TrustEngine(), permissions, sessionApprovals: new Set() });
    const pending = executor.execute("browser.click", { target: "Open Settings" }, context);
    await expect.poll(() => consent.pendingCount).toBe(1);
    expect(evaluateDecision).not.toHaveBeenCalled();
    expect(f.browser.click).not.toHaveBeenCalled();
    consent.approve(consent.listPending()[0]!.id);
    expect(await pending).toMatchObject({ ok: true });
    expect(f.browser.click).toHaveBeenCalledTimes(1);
  });
});
