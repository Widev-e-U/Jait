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
import type { ToolDefinition } from "../contracts.js";
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
export declare function createWebTool(): ToolDefinition<WebInput>;
export {};
//# sourceMappingURL=web.d.ts.map