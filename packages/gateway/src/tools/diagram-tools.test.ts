import { describe, expect, it } from "vitest";
import { ToolRegistry } from "./registry.js";
import { createJaitCatalogTool } from "./catalog-tools.js";
import { mcpContentForToolResult } from "../routes/mcp-server.js";
import { ASK_MODE_TOOLS, SWARM_ORCHESTRATION_TOOLS } from "./chat-modes.js";
import { createDiagramTool } from "./diagram-tools.js";

describe("diagram.render", () => {
  const tool = createDiagramTool();
  it("returns self-contained source without needing a project or client", async () => {
    const result = await tool.execute({ diagram: " flowchart LR\nA-->B ", title: "Communication" }, {} as any);
    expect(result).toMatchObject({ ok: true, data: { kind: "mermaid-diagram", title: "Communication", diagram: "flowchart LR\nA-->B" } });
  });
  it.each([undefined, 123, " ", "a".repeat(20001)])("rejects invalid or oversized input", async (diagram) => {
    expect((await tool.execute({ diagram } as any, {} as any)).ok).toBe(false);
  });
  it("is available through discovery and MCP with no mutation consent", async () => {
    const registry = new ToolRegistry();
    registry.register(tool);
    expect(registry.get("diagram.render")?.defaultConsentLevel).toBe("none");
    expect(ASK_MODE_TOOLS.has("diagram.render")).toBe(true);
    expect(SWARM_ORCHESTRATION_TOOLS.has("diagram.render")).toBe(true);
    expect(registry.listForMcp().map(tool => tool.name)).toContain("diagram.render");
    expect(registry.search("render Mermaid chat")[0].name).toBe("diagram.render");
    const catalog = await createJaitCatalogTool(registry).execute({ pageId: "chat" }, {} as any);
    expect((catalog.data as any).matches.map((match: any) => match.name)).toContain("diagram.render");
    const result = await registry.execute("diagram.render", { diagram: "graph TD\nA-->B" }, {} as any);
    const text = (mcpContentForToolResult(result)[0] as { text: string }).text;
    expect(JSON.parse(text.slice(text.indexOf("{")))).toMatchObject({ kind: "mermaid-diagram", diagram: "graph TD\nA-->B" });
    expect((await registry.execute("diagram.render", {}, {} as any)).ok).toBe(false);
  });
  it("bounds titles", async () => {
    expect((await tool.execute({ diagram: "graph TD\nA-->B", title: "a".repeat(201) }, {} as any)).ok).toBe(false);
  });
});
