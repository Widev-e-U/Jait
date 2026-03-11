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
import type { ToolContext } from "../tools/contracts.js";
import { uuidv7 } from "../db/uuidv7.js";

interface McpDeps {
  toolRegistry: ToolRegistry;
  config: AppConfig;
}

// ── MCP JSON-RPC types ───────────────────────────────────────────────

interface McpRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface McpResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ── Connected client tracking ────────────────────────────────────────

interface McpClient {
  id: string;
  write: (data: string) => void;
  alive: boolean;
}

const clients = new Map<string, McpClient>();

// ── Route registration ───────────────────────────────────────────────

export function registerMcpRoutes(app: FastifyInstance, deps: McpDeps): void {
  const { toolRegistry } = deps;

  /**
   * GET /mcp/sse — SSE connection endpoint.
   * Client connects here and receives:
   *  1. endpoint event with the POST URL for sending requests
   *  2. keepalive pings
   */
  app.get("/mcp/sse", async (request, reply) => {
    const clientId = uuidv7();

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const write = (data: string) => {
      try {
        reply.raw.write(data);
      } catch {
        client.alive = false;
      }
    };

    const client: McpClient = { id: clientId, write, alive: true };
    clients.set(clientId, client);

    // Send the endpoint URL for the client to POST requests to
    const baseUrl = `http://${request.hostname}`;
    write(`event: endpoint\ndata: ${baseUrl}/mcp/messages?clientId=${clientId}\n\n`);

    // Keepalive
    const interval = setInterval(() => {
      if (!client.alive) {
        clearInterval(interval);
        clients.delete(clientId);
        return;
      }
      write(": keepalive\n\n");
    }, 15_000);

    reply.raw.on("close", () => {
      client.alive = false;
      clearInterval(interval);
      clients.delete(clientId);
    });
  });

  /**
   * POST /mcp/messages — JSON-RPC request handler.
   * External CLI agents send method calls here.
   */
  app.post("/mcp/messages", async (request, reply) => {
    const clientId = (request.query as Record<string, string>)["clientId"];

    if (!clientId || !clients.has(clientId)) {
      return reply.status(400).send({ error: "Invalid or missing clientId" });
    }

    const body = request.body as McpRequest;

    if (!body || body.jsonrpc !== "2.0" || !body.method) {
      return reply.status(400).send({ error: "Invalid JSON-RPC request" });
    }

    const response = await handleMcpRequest(body, toolRegistry);

    // Also push the response via SSE to the connected client
    const client = clients.get(clientId);
    if (client?.alive) {
      client.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
    }

    return reply.send(response);
  });

  app.log.info("MCP SSE server routes registered at /mcp/sse and /mcp/messages");
}

// ── Request handler ──────────────────────────────────────────────────

async function handleMcpRequest(
  request: McpRequest,
  toolRegistry: ToolRegistry,
): Promise<McpResponse> {
  switch (request.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: {
            name: "jait-gateway",
            version: "1.0.0",
          },
        },
      };

    case "tools/list":
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          tools: toolRegistry.list()
            .filter((t) => (t.source ?? "builtin") === "builtin")
            .map((tool) => ({
              name: tool.name,
              description: tool.description,
              inputSchema: {
                ...tool.parameters,
                type: "object",
              },
            })),
        },
      };

    case "tools/call": {
      const params = request.params ?? {};
      const toolName = String(params["name"] ?? "");
      const args = params["arguments"] ?? {};

      const tool = toolRegistry.get(toolName);
      if (!tool) {
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
            isError: true,
          },
        };
      }

      const context: ToolContext = {
        sessionId: "mcp-session",
        actionId: uuidv7(),
        workspaceRoot: process.cwd(),
        requestedBy: "mcp-client",
      };

      try {
        const result = await tool.execute(args, context);
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            content: [
              {
                type: "text",
                text: typeof result.data === "string"
                  ? result.data
                  : result.message + (result.data ? `\n${JSON.stringify(result.data)}` : ""),
              },
            ],
            isError: !result.ok,
          },
        };
      } catch (err) {
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            content: [{ type: "text", text: `Tool execution error: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          },
        };
      }
    }

    default:
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32601, message: `Method not found: ${request.method}` },
      };
  }
}
