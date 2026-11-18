import { describe, expect, it, vi } from "vitest";
import { createBrowserIntelligenceTools } from "./browser-tools.js";
import type { SurfaceRegistry } from "../surfaces/registry.js";
import type { ToolContext } from "./contracts.js";

const context: ToolContext = { sessionId: "chat", actionId: "test", projectRoot: "/project", requestedBy: "test" };
function fixture() {
  const browser = { id: "browser-chat", type: "browser", state: "running", sessionId: "chat",
    inspect: vi.fn(async () => ({ target: { found: true, text: "Invoice October" } })) };
  const session = { id: "chat", sessionId: "chat", browserId: browser.id, controller: "agent", secretSafe: false };
  const collaboration = { getSessionByPreviewSessionId: () => session, getSessionByBrowserId: () => session,
    assertAgentControl: vi.fn(() => { if (session.controller !== "agent") throw new Error("not shared"); }) };
  const registry = { getSurface: () => browser } as unknown as SurfaceRegistry;
  const intelligence = { observe: vi.fn(async () => ({ actions: [] })), extract: vi.fn(async () => ({ values: { month: "October" } })) };
  const tools = createBrowserIntelligenceTools(registry, collaboration, intelligence);
  const tool = (name: string) => tools.find(tool => tool.name === `browser.${name}`)!;
  return { browser, session, intelligence, tool };
}
describe("browser intelligence boundaries", () => {
  it("discovers without running an action and validates extraction fields", async () => {
    const { intelligence, tool } = fixture();
    expect(await tool("observe").execute({ instruction: "Find invoices" }, context)).toMatchObject({ ok: true, data: { actions: [] } });
    expect(intelligence.extract).not.toHaveBeenCalled();
    const input = { instruction: "Read month", fields: [{ name: "month", description: "Invoice month", type: "string" }] };
    expect(await tool("extract").execute(input, context)).toMatchObject({ ok: true, data: { values: { month: "October" } } });
    await expect(tool("extract").execute({ ...input, fields: [...input.fields, ...input.fields] }, context)).rejects.toThrow();
    await expect(tool("observe").execute({ instruction: "x", browserId: "another-chat" }, context)).rejects.toThrow();
  });
  it("blocks secret-safe sessions, human control, other chats and cancelled calls before inference", async () => {
    const { browser, session, intelligence, tool } = fixture();
    session.secretSafe = true;
    await expect(tool("observe").execute({ instruction: "Find" }, context)).rejects.toThrow("secret-safe");
    session.secretSafe = false; session.controller = "user";
    await expect(tool("observe").execute({ instruction: "Find" }, context)).rejects.toThrow("not shared");
    session.controller = "agent";
    // Without a preview link, normal ownership still applies.
    const tools = createBrowserIntelligenceTools({ getSurface: () => browser } as unknown as SurfaceRegistry, undefined, intelligence);
    await expect(tools[0]!.execute({ instruction: "Find" }, { ...context, sessionId: "other" })).rejects.toThrow("another chat");
    const controller = new AbortController(); controller.abort();
    expect(await tool("observe").execute({ instruction: "Find" }, { ...context, signal: controller.signal })).toMatchObject({ ok: false });
    expect(intelligence.observe).not.toHaveBeenCalled();
  });
  it("suppresses results if control or privacy changes during inference and redacts SDK errors", async () => {
    const { session, intelligence, tool } = fixture();
    intelligence.observe.mockImplementationOnce(async () => { session.secretSafe = true; return { actions: [] }; });
    await expect(tool("observe").execute({ instruction: "Find" }, context)).rejects.toThrow("secret-safe");
    session.secretSafe = false;
    intelligence.observe.mockRejectedValueOnce(new Error("secret credential and page content"));
    const result = await tool("observe").execute({ instruction: "Find" }, context);
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("secret credential");
    intelligence.observe.mockRejectedValueOnce(new Error("Incorrect API key provided: sk-proj-fixture-secret"));
    const rejected = await tool("observe").execute({ instruction: "Find" }, context);
    expect(rejected.message).toContain("rejected the API key");
    expect(JSON.stringify(rejected)).not.toContain("sk-proj");
  });
  it("verifies deterministic outcomes and fails when expected results disappear", async () => {
    const { browser, intelligence, tool } = fixture();
    expect(await tool("check").execute({ selector: "#invoice", text: "October" }, context)).toMatchObject({ ok: true });
    expect(await tool("check").execute({ selector: "#invoice", text: "November" }, context)).toMatchObject({ ok: false });
    browser.inspect.mockResolvedValueOnce({ target: { found: false, text: "" } });
    expect(await tool("check").execute({ selector: "#missing" }, context)).toMatchObject({ ok: false });
    expect(intelligence.observe).not.toHaveBeenCalled();
  });
});
