import { describe, it, expect } from "vitest";
import { JAIT_PAGE_IDS } from "@jait/shared";
import { mcpContentForToolResult } from "../routes/mcp-server.js";
import { ToolRegistry } from "./registry.js";
import { createJaitCatalogTool } from "./catalog-tools.js";
import type { ToolContext, ToolDefinition } from "./contracts.js";

const context: ToolContext = { userId: "owner", sessionId: "chat", projectRoot: "/tmp", requestedBy: "agent", actionId: "test" };
const stub = (name: string, category: ToolDefinition["category"] = "agent"): ToolDefinition => ({
  name, description: name === "agent.profiles" ? "Create persistent people and Scrum teams" : "Inspect capabilities",
  category, parameters: { type: "object", properties: {} },
  async execute() { return { ok: true, message: "Done" }; },
});
describe("live Jait capability catalog", () => {
  it("resolves new tools and removals without rebuilding a second catalog", async () => {
    const registry = new ToolRegistry();
    const catalog = createJaitCatalogTool(registry);
    registry.register(catalog);
    registry.register(stub("agent.profiles"));
    registry.register(stub("agent.profiles.inspect"));
    let result = await catalog.execute({ pageId: "agents" }, context);
    expect((result.data as any).pages[0].tools.map((t: any) => t.name)).toContain("agent.profiles");
    registry.register({ ...stub("my.new.tool"), page: "agents" });
    result = await catalog.execute({ pageId: "agents" }, context);
    expect((result.data as any).pages[0].tools.map((t: any) => t.name)).toContain("my.new.tool");
    registry.unregister("agent.profiles");
    result = await catalog.execute({ pageId: "agents" }, context);
    expect((result.data as any).pages[0].features[0].missingToolRefs).toContain("agent.profiles");
    expect((result.data as any).matches.map((t: any) => t.name)).not.toContain("agent.profiles");
  });
  it("finds persistent teams, returns executable refs, and keeps the overview compact", async () => {
    const registry = new ToolRegistry();
    registry.register(stub("agent.profiles"));
    const catalog = createJaitCatalogTool(registry);
    const data = (await catalog.execute({ query: "Scrum team" }, context)).data as any;
    expect(data.pages[0].id).toBe("agents");
    expect(data.matches).toEqual(expect.arrayContaining([expect.objectContaining({ name: "agent.profiles", parameters: expect.any(Object) })]));
    expect(data.pageLinks[0]).toEqual({ pageId: "agents", title: "Agents", href: "/agents" });
    const all = (await catalog.execute({}, context)).data as any;
    expect(all.pages).toHaveLength(JAIT_PAGE_IDS.length);
    expect(all.matches).toEqual([]);
  });
  it("does not advertise hidden core tools to MCP and attaches trusted page links to results", async () => {
    const registry = new ToolRegistry();
    registry.register({ ...stub("edit", "filesystem"), tier: "core" });
    registry.register(stub("agent.profiles"));
    const catalog = createJaitCatalogTool(registry);
    registry.register(catalog);
    expect(registry.listForMcp().map((t) => t.name)).toContain("jait.catalog");
    const data = (await catalog.execute({ pageId: "chat" }, { ...context, requestedBy: "mcp-client" })).data as any;
    expect(data.pages[0].tools.map((t: any) => t.name)).not.toContain("edit");
    const changed = await registry.execute("agent.profiles", {}, context);
    expect(changed.data).toEqual({ pageLinks: [{ pageId: "agents", title: "Agents", href: "/agents" }] });
    registry.register(stub("custom.adapter", "external"));
    const settings = (await catalog.execute({ pageId: "settings" }, context)).data as any;
    expect(settings.pages[0].tools.map((t: any) => t.name)).toContain("custom.adapter");
  });
  it("paginates live tools and preserves JSON when a tool schema is larger than the MCP limit", async () => {
    const registry = new ToolRegistry();
    for (let index = 0; index < 20; index++) registry.register(stub(`agent.profiles.custom${index}`));
    registry.register({ ...stub("agent.profiles.huge"), parameters: { type: "object", properties: {
      payload: { type: "string", description: "x".repeat(50_000) },
    } } });
    const catalog = createJaitCatalogTool(registry);
    const first = await catalog.execute({ pageId: "agents" }, context);
    expect((first.data as any).pages[0]).toMatchObject({ toolCount: 21, hasMoreTools: true });
    expect((first.data as any).pages[0].tools).toHaveLength(15);
    const next = await catalog.execute({ pageId: "agents", toolOffset: 15 }, context);
    expect((next.data as any).pages[0].tools).toHaveLength(6);
    expect((next.data as any).schemaLookupRequired).toContain("agent.profiles.huge");
    const content = mcpContentForToolResult(next);
    const text = (content[0] as { text: string }).text;
    expect(text.length).toBeLessThan(30_000);
    expect(() => JSON.parse(text.slice(text.indexOf("{")))).not.toThrow();
  });

});
