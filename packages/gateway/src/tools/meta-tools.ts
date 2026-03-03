/**
 * Meta-tools — tools.search and tools.list
 *
 * These are "discovery" tools that let the LLM find and load tool schemas
 * on demand, rather than sending all 40+ schemas in every request.
 *
 * tools.list  — Returns a brief catalogue of all available tools grouped by
 *               category, with tier badges. Lightweight (names + one-liners).
 * tools.search — Searches tools by keyword and returns FULL schemas so the
 *                LLM can use them in subsequent rounds.
 *
 * Both are tier: "core" so they're always available.
 */

import type { ToolDefinition, ToolCategory } from "./contracts.js";
import type { ToolRegistry } from "./registry.js";
import { toOpenAIName } from "./agent-loop.js";

// ── tools.list ───────────────────────────────────────────────────────

interface ToolsListInput {
  category?: string;
}

export function createToolsListTool(registry: ToolRegistry): ToolDefinition<ToolsListInput> {
  return {
    name: "tools.list",
    description:
      "List all available tools grouped by category. Use this to discover what tools exist before calling tools.search for full schemas. Optionally filter by category.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description:
            "Optional category filter: terminal, filesystem, os, surfaces, scheduler, gateway, screen, browser, web, memory, voice, agent, meta, external",
          enum: [
            "terminal",
            "filesystem",
            "os",
            "surfaces",
            "scheduler",
            "gateway",
            "screen",
            "browser",
            "web",
            "memory",
            "voice",
            "agent",
            "meta",
            "external",
          ],
        },
      },
      required: [],
    },
    tier: "core",
    category: "meta",
    source: "builtin",
    async execute(input) {
      let tools = registry.listInfo();

      if (input.category) {
        tools = tools.filter((t) => t.category === input.category);
      }

      // Group by category
      const grouped = new Map<ToolCategory, typeof tools>();
      for (const t of tools) {
        const cat = t.category;
        if (!grouped.has(cat)) grouped.set(cat, []);
        grouped.get(cat)!.push(t);
      }

      const lines: string[] = [];
      for (const [cat, items] of grouped) {
        lines.push(`## ${cat}`);
        for (const t of items) {
          const tierBadge = t.tier === "core" ? " [core]" : t.tier === "external" ? " [external]" : "";
          lines.push(`- **${t.name}**${tierBadge}: ${t.description}`);
        }
        lines.push("");
      }

      return {
        ok: true,
        message: `Found ${tools.length} tool(s) across ${grouped.size} category/categories.`,
        data: {
          total: tools.length,
          categories: [...grouped.keys()],
          catalogue: lines.join("\n"),
        },
      };
    },
  };
}

// ── tools.search ─────────────────────────────────────────────────────

interface ToolsSearchInput {
  query: string;
}

export function createToolsSearchTool(registry: ToolRegistry): ToolDefinition<ToolsSearchInput> {
  return {
    name: "tools.search",
    description:
      "Search available tools by keyword and return their FULL schemas (name, description, parameters). Call this when you need a tool that isn\u2019t in your current set \u2014 e.g. browser, cron, memory, screen, voice, or any MCP tool.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Search keyword(s). Matches against tool names, descriptions, and categories. Examples: 'browser', 'schedule cron', 'memory save', 'screenshot'.",
        },
      },
      required: ["query"],
    },
    tier: "core",
    category: "meta",
    source: "builtin",
    async execute(input) {
      const results = registry.search(input.query);

      if (results.length === 0) {
        return {
          ok: true,
          message: `No tools found matching "${input.query}". Try broader keywords or use tools.list to see all available tools.`,
          data: { matches: [] },
        };
      }

      // Return full schemas so the LLM can use them
      const schemas = results.map((t) => ({
        name: t.name,
        openai_name: toOpenAIName(t.name),
        description: t.description,
        tier: t.tier ?? "standard",
        category: t.category ?? "external",
        parameters: t.parameters,
      }));

      return {
        ok: true,
        message: `Found ${results.length} tool(s) matching "${input.query}". You can now call these tools directly.`,
        data: { matches: schemas },
      };
    },
  };
}
