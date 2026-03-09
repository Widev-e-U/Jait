/**
 * Provider Contracts — CLI agent provider abstraction.
 *
 * Supports three provider types:
 *  1. "jait"        — Jait's own runAgentLoop (OpenAI-compatible API)
 *  2. "codex"       — OpenAI Codex CLI via stdio JSON-RPC
 *  3. "claude-code" — Anthropic Claude Code CLI via stdio
 *
 * Each CLI provider can optionally connect to Jait's MCP server
 * to access custom tools (memory, cron, web, todo, etc.).
 */
export {};
//# sourceMappingURL=contracts.js.map