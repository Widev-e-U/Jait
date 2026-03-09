/**
 * MCP SSE Server — exposes Jait's tool registry as an MCP-compatible endpoint.
 *
 * External CLI agents (Codex, Claude Code) connect to this SSE endpoint
 * to discover and execute Jait's custom tools (memory, cron, todo, etc.).
 *
 * Protocol: Server-Sent Events (SSE) for server→client, POST for client→server.
 * Follows the MCP transport specification for HTTP/SSE.
 *
 * Endpoints:
 *   GET  /mcp/sse       — SSE connection (tool list + event stream)
 *   POST /mcp/messages   — JSON-RPC requests from the connected client
 */
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import type { ToolRegistry } from "../tools/registry.js";
interface McpDeps {
    toolRegistry: ToolRegistry;
    config: AppConfig;
}
export declare function registerMcpRoutes(app: FastifyInstance, deps: McpDeps): void;
export {};
//# sourceMappingURL=mcp-server.d.ts.map