import { JAIT_PAGES, JAIT_PAGE_IDS, isJaitPageTool, jaitPageLink, type JaitPageContract } from "@jait/shared";
import type { ToolDefinition } from "./contracts.js";
import type { ToolRegistry } from "./registry.js";
import { toOpenAIName } from "./agent-loop.js";

export function createJaitCatalogTool(registry: ToolRegistry): ToolDefinition<{ query?: string; pageId?: string; toolOffset?: number }> {
  return {
    name: "jait.catalog",
    displayName: "Jait capability catalog",
    description: "Discover what the Jait harness and its pages can do. Returns a live feature tree, explanations, exact tool references and schemas, missing tool coverage, and page links. For persistent teams choose agents; execution workers belong to threads.",
    tier: "core", category: "meta", source: "builtin", risk: "low", defaultConsentLevel: "none",
    discovery: { aliases: ["harness", "capabilities", "feature tree", "catalogue", "Jait pages", "Scrum team"] },
    parameters: { type: "object", properties: {
      query: { type: "string", description: "Optional user outcome or page search. Omit to get the entire tree." },
      pageId: { type: "string", enum: JAIT_PAGE_IDS, description: "Optional exact page." },
      toolOffset: { type: "integer", description: "Tool pagination offset for the selected page. Each page returns at most 15 tool references." },
    } },
    async execute(input, context) {
      const tools = context.requestedBy === "mcp-client" ? registry.listForMcp() : registry.list();
      const offset = Math.max(0, Math.floor(input.toolOffset ?? 0));
      const query = (input.query ?? "").toLowerCase().trim();
      const words = query.split(/\s+/).filter((word) => word.length > 2 && !["the", "for", "with", "jait", "can", "you", "harness"].includes(word));
      const pages = JAIT_PAGE_IDS.filter((id) => !input.pageId || input.pageId === id).map((id) => {
        const page: JaitPageContract = JAIT_PAGES[id];
        const resolved = tools.filter((tool) => isJaitPageTool(tool, id));
        const searchText = [id, page.title, page.description, ...page.examples, ...page.features.map((f) => f.description), ...resolved.map((t) => t.description)].join(" ").toLowerCase();
        const score = words.filter((word) => searchText.includes(word)).length;
        return { id, title: page.title, description: page.description, examples: page.examples,
          link: jaitPageLink(id), features: page.features.map((feature) => ({
            ...feature, availableToolRefs: feature.toolRefs.filter((name) => tools.some((tool) => tool.name === name)),
            missingToolRefs: feature.toolRefs.filter((name) => !tools.some((tool) => tool.name === name)),
          })),
          toolCount: resolved.length, hasMoreTools: resolved.length > offset + 15,
          tools: resolved.slice(offset, offset + 15).map((tool) => ({ name: tool.name, risk: tool.risk ?? "low",
            consent: tool.defaultConsentLevel ?? "none" })),
          score };
      }).filter((page) => words.length === 0 || page.score > 0).sort((a, b) => b.score - a.score);
      const candidates = tools.filter((tool) => pages.some((page) => isJaitPageTool(tool, page.id)));
      // Keep the overview compact; targeted lookups activate at most 12 schemas.
      const selected = input.pageId ? candidates.slice(offset, offset + 12)
        : words.length ? registry.search(query, { candidates, limit: 12 }) : [];
      let matches = selected.map((tool) => ({ name: tool.name, description: tool.description,
        parameters: tool.parameters, openai_name: toOpenAIName(tool.name) }));
      const covered = new Set(JAIT_PAGE_IDS.flatMap((id) => {
        return tools.filter((tool) => isJaitPageTool(tool, id)).map((tool) => tool.name);
      }));
      const data = { version: 1, pages, matches, pageLinks: pages.map((page) => page.link),
        uncataloguedTools: tools.filter((tool) => !covered.has(tool.name)).map((tool) => ({ name: tool.name })),
        schemaLookupRequired: [] as string[] };
      // MCP caps text at 30k characters. Preserve valid JSON and navigation data
      // by dropping excess schemas before transport, with exact lookup refs.
      while (JSON.stringify(data).length > 24_000 && matches.length) {
        const removed = matches.pop()!;
        data.schemaLookupRequired.push(removed.name);
      }
      data.matches = matches;
      return { ok: true, message: pages.length
        ? pages.map((page) => `${page.title}: ${page.description} — ${page.toolCount} available tools. Open ${page.link.href}`).join("\n")
        : "No matching Jait capability. Try a broader query or omit it to inspect all pages.",
        data };
    },
  };
}
