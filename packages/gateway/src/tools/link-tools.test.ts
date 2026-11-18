import { describe, it, expect } from "vitest";
import { mcpContentForToolResult } from "../routes/mcp-server.js";
import { ToolRegistry } from "./registry.js";
import { createJaitCatalogTool } from "./catalog-tools.js";
import { jaitLinkTool } from "./link-tools.js";
import { ASK_MODE_TOOLS, SWARM_ORCHESTRATION_TOOLS } from "./chat-modes.js";
import type { ToolContext } from "./contracts.js";

const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };

describe("explicit Jait links", () => {
  it("returns a typed link without performing navigation or mutations", async () => {
    expect(await jaitLinkTool.execute({ href: "/agents", label: "  View the updated team  " }, context)).toEqual({
      ok: true, message: "View the updated team", data: { kind: "jait-link", href: "/agents", label: "View the updated team" },
    });
    expect(jaitLinkTool.defaultConsentLevel).toBe("none");
    expect(ASK_MODE_TOOLS.has("jait.link")).toBe(true);
    expect(SWARM_ORCHESTRATION_TOOLS.has("jait.link")).toBe(true);
  });
  it.each(["/jobs", "/network", "/settings", "/chat?sessionId=abc%26def", "/threads?threadId=thread-1"])("preserves supported destination %s", async (href) => {
    const result = await jaitLinkTool.execute({ href, label: "View changes" }, context);
    expect(result.data).toMatchObject({ href });
  });
  it.each(["/emails", "/email", "/settings", "/todo", "/messenger", "/chat", "/"])("encodes search text for %s", async (path) => {
    const search = 'from:alice+work@example.test subject:"München & budget" #1';
    const result = await jaitLinkTool.execute({ href: path + "?q=old", label: "Search", search }, context);
    expect(result.ok).toBe(true);
    const url = new URL((result.data as { href: string }).href, "https://jait.invalid");
    expect(url.searchParams.getAll("q")).toEqual([search]);
    expect(url.hash).toBe("");
  });
  it("preserves other parameters and explicitly clears search", async () => {
    const result = await jaitLinkTool.execute({ href: "/settings?tab=tools&toolsQ=file&q=old", label: "Tools", search: "" }, context);
    expect(result.data).toMatchObject({ href: "/settings?tab=tools&toolsQ=file&q=" });
  });
  it("rejects searches for pages without a primary search and oversized search links", async () => {
    expect((await jaitLinkTool.execute({ href: "/jobs", label: "Jobs", search: "test" }, context)).ok).toBe(false);
    expect((await jaitLinkTool.execute({ href: "/emails", label: "Mail", search: "a".repeat(4096) }, context)).ok).toBe(false);
  });
  it("publishes supported search parameters through the catalog and MCP schema", async () => {
    const registry = new ToolRegistry();
    registry.register(jaitLinkTool);
    const result = await createJaitCatalogTool(registry).execute({ pageId: "settings" }, context);
    expect(result.data).toMatchObject({ pages: [{ queryParameters: { q: expect.any(String), tab: expect.any(String), toolsQ: expect.any(String) } }] });
    expect(registry.listForMcp().find(tool => tool.name === "jait.link")?.parameters).toMatchObject({ properties: { search: { type: "string" } } });
  });
  it.each(["https://evil.test", "//evil.test/agents", "javascript:alert(1)", "/api/auth", "/agents#unsupported", "/\\evil.test", "/agents\n"])("rejects unsafe or unsupported destination %s", async (href) => {
    expect((await jaitLinkTool.execute({ href, label: "View changes" }, context)).ok).toBe(false);
  });
  it.each(["", "  ", "x".repeat(161), "label\ncontrol"])("rejects invalid label", async (label) => {
    expect((await jaitLinkTool.execute({ href: "/agents", label }, context)).ok).toBe(false);
  });
  it("is discoverable by native agents, the catalog, and external MCP clients", async () => {
    const registry = new ToolRegistry();
    registry.register(jaitLinkTool);
    expect(registry.listForMcp().map(tool => tool.name)).toContain("jait.link");
    expect(registry.search("render link")[0].name).toBe("jait.link");
    const catalog = await createJaitCatalogTool(registry).execute({ pageId: "chat" }, context);
    expect((catalog.data as { matches: { name: string }[] }).matches.map(tool => tool.name)).toContain("jait.link");
    const result = await jaitLinkTool.execute({ href: "/agents", label: "View team" }, context);
    const text = (mcpContentForToolResult(result)[0] as { text: string }).text;
    expect(JSON.parse(text.slice(text.indexOf("{")))).toMatchObject({ kind: "jait-link", href: "/agents" });
  });
});
