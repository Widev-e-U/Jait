/**
 * web — Unified web tool: search the web or fetch URLs.
 *
 * Inspired by VS Code Copilot's fetch_webpage:
 * - `urls` supports an array (fetch multiple pages at once)
 * - `query` provides context for what you're looking for in fetched content
 * - Multiple search providers (openai, brave, perplexity, grok, gemini, kimi)
 *
 * Our advantage over Copilot: built-in web search, not just fetch.
 */

import type { ToolDefinition, ToolResult, ToolContext } from "../contracts.js";
import { createWebSearchTool, createWebFetchTool } from "../browser-tools.js";

interface WebInput {
  /** What to do: "search" (web search) or "fetch" (get URL contents). Default: inferred from params */
  mode?: string;
  /** Search query (for search mode) */
  query?: string;
  /** URL or array of URLs to fetch (for fetch mode) */
  url?: string;
  /** Array of URLs to fetch — alternative to single `url` */
  urls?: string[];
  /** Search provider: "auto", "openai", "brave", "perplexity", "grok", "gemini", "kimi". Default: "auto" */
  provider?: string;
  /** Max results for search (default: 5) */
  limit?: number;
  /** HTTP method for fetch (default: "GET") */
  method?: string;
  /** Request body for fetch (POST/PUT) */
  body?: string;
  /** Max response bytes for fetch (default: 512KB) */
  maxBytes?: number;
}

export function createWebTool(): ToolDefinition<WebInput> {
  const searchInner = createWebSearchTool();
  const fetchInner = createWebFetchTool();

  return {
    name: "web",
    description:
      "Search the web or fetch content from URLs. Provide query for search, url/urls for fetching.",
    tier: "core",
    category: "web",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {
        mode: {
          type: "string",
          description: '"search" or "fetch". Inferred from params if omitted.',
          enum: ["search", "fetch"],
        },
        query: {
          type: "string",
          description: "Search query.",
        },
        url: {
          type: "string",
          description: "URL to fetch.",
        },
        urls: {
          type: "array",
          items: { type: "string" },
          description: "Multiple URLs to fetch.",
        },
        provider: {
          type: "string",
          description: "Search provider (default: auto).",
        },
        limit: {
          type: "number",
          description: "Max search results to return (default: 5).",
        },
        method: {
          type: "string",
          description: 'HTTP method for fetch (default: "GET").',
        },
        body: {
          type: "string",
          description: "Request body for fetch (used with POST/PUT).",
        },
        maxBytes: {
          type: "number",
          description: "Max response bytes for fetch (default: 512KB).",
        },
      },
      required: [],
    },
    async execute(input: WebInput, context: ToolContext): Promise<ToolResult> {
      const mode = input.mode ?? (input.url || input.urls ? "fetch" : "search");

      if (mode === "fetch") {
        // Collect all URLs from both url and urls params
        const allUrls: string[] = [];
        if (input.url) allUrls.push(input.url);
        if (input.urls) allUrls.push(...input.urls);

        if (allUrls.length === 0) {
          return { ok: false, message: "Fetch mode requires at least one URL via `url` or `urls`." };
        }

        // Fetch single URL
        if (allUrls.length === 1) {
          return fetchInner.execute(
            {
              url: allUrls[0],
              method: input.method,
              body: input.body,
              maxBytes: input.maxBytes,
            } as any,
            context,
          );
        }

        // Fetch multiple URLs in parallel
        const results = await Promise.allSettled(
          allUrls.map((u) =>
            fetchInner.execute(
              { url: u, method: input.method, maxBytes: input.maxBytes } as any,
              context,
            ),
          ),
        );

        const fetched = results.map((r, i) => {
          if (r.status === "fulfilled") {
            return { url: allUrls[i], ...r.value };
          }
          return { url: allUrls[i], ok: false, message: String(r.reason) };
        });

        const okCount = fetched.filter((f) => f.ok).length;
        return {
          ok: okCount > 0,
          message: `Fetched ${okCount}/${allUrls.length} URLs successfully`,
          data: { results: fetched },
        };
      }

      // Search mode
      if (!input.query) {
        return { ok: false, message: "Search mode requires a `query`." };
      }
      return searchInner.execute(
        {
          query: input.query,
          provider: input.provider as any,
          limit: input.limit,
        } as any,
        context,
      );
    },
  };
}
