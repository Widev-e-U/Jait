/**
 * MCP HTTP Server — exposes Jait's tool registry as MCP-compatible endpoints.
 *
 * Modern clients such as recent Codex builds expect Streamable HTTP at a
 * single `/mcp` endpoint. Older clients may still use the deprecated split
 * HTTP+SSE transport (`/mcp/sse` + `/mcp/messages`), so we keep both.
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { verifyAuthToken, extractBearerToken } from "../security/http-auth.js";
import type { SessionService } from "../services/sessions.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { ToolContext, ToolDefinition } from "../tools/contracts.js";
import { uuidv7 } from "../db/uuidv7.js";

interface McpDeps {
  toolRegistry: ToolRegistry;
  config: AppConfig;
  sessionService?: SessionService;
}

// ── MCP JSON-RPC types ───────────────────────────────────────────────

interface McpRequest {
  jsonrpc: "2.0";
  id?: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface McpResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface McpToolContextOverrides {
  sessionId?: string;
  workspaceRoot?: string;
}

const SUPPORTED_MCP_PROTOCOL_VERSIONS = new Set([
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
  "2025-11-25",
]);
const DEFAULT_MCP_PROTOCOL_VERSION = "2025-03-26";

function normalizeMcpProtocolVersion(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return SUPPORTED_MCP_PROTOCOL_VERSIONS.has(value) ? value : null;
}

function resolveRequestedProtocolVersion(request: McpRequest, headers?: Record<string, unknown>): string | null {
  const headerValue = normalizeMcpProtocolVersion(headers?.["mcp-protocol-version"]);
  if (headerValue) return headerValue;
  return normalizeMcpProtocolVersion(request.params?.["protocolVersion"]);
}

function applyMcpProtocolVersionHeader(
  reply: { header: (name: string, value: string) => unknown },
  version: string,
): void {
  reply.header("MCP-Protocol-Version", version);
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function resolveMcpToolContextOverrides(
  request: Pick<FastifyRequest, "headers"> | null,
  params?: Record<string, unknown>,
): McpToolContextOverrides {
  const headers = request?.headers as Record<string, unknown> | undefined;
  return {
    sessionId:
      readOptionalString(headers?.["x-jait-session-id"])
      ?? readOptionalString(params?.["sessionId"]),
    workspaceRoot:
      readOptionalString(headers?.["x-jait-workspace-root"])
      ?? readOptionalString(params?.["workspaceRoot"]),
  };
}

async function resolveMcpToolContext(
  request: FastifyRequest | null,
  config: AppConfig,
  sessionService?: SessionService,
  params?: Record<string, unknown>,
): Promise<McpToolContextOverrides> {
  const overrides = resolveMcpToolContextOverrides(request, params);
  if (overrides.sessionId) return overrides;
  if (!request || !sessionService) return overrides;

  const token = extractBearerToken(request.headers.authorization);
  if (!token) return overrides;
  const user = await verifyAuthToken(token, config.jwtSecret);
  if (!user) return overrides;

  const session = sessionService.lastActive(user.id);
  if (!session?.id) return overrides;
  return {
    sessionId: session.id,
    workspaceRoot: overrides.workspaceRoot ?? session.workspacePath ?? undefined,
  };
}

// ── Connected client tracking ────────────────────────────────────────

interface McpClient {
  id: string;
  write: (data: string) => void;
  alive: boolean;
}

const clients = new Map<string, McpClient>();

interface McpBaseUrlRequestLike {
  headers: Record<string, unknown>;
  protocol?: string;
  hostname?: string;
}

export function resolveMcpBaseUrl(
  request: McpBaseUrlRequestLike,
  config: Pick<AppConfig, "host" | "port">,
): string {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const proto = typeof forwardedProto === "string"
    ? forwardedProto.split(",")[0]?.trim()
    : request.protocol;
  const forwardedHost = request.headers["x-forwarded-host"];
  const hostHeader = typeof forwardedHost === "string"
    ? forwardedHost.split(",")[0]?.trim()
    : typeof request.headers.host === "string"
      ? request.headers.host
      : undefined;

  if (proto && hostHeader) {
    return `${proto}://${hostHeader}`;
  }

  const host = config.host === "0.0.0.0"
    ? "127.0.0.1"
    : request.hostname?.trim() || config.host;
  return `${proto ?? "http"}://${host}:${config.port}`;
}

export function listToolsForMcp(toolRegistry: ToolRegistry): ToolDefinition[] {
  return toolRegistry.list().filter((tool) => {
    const source = tool.source ?? "builtin";
    const tier = tool.tier ?? "standard";
    return source === "builtin" && tier !== "core";
  });
}

// ── Route registration ───────────────────────────────────────────────

export function registerMcpRoutes(app: FastifyInstance, deps: McpDeps): void {
  const { toolRegistry, config, sessionService } = deps;

  app.get("/mcp", async (_request, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    reply.raw.write(": connected\n\n");

    const interval = setInterval(() => {
      try {
        reply.raw.write(": keepalive\n\n");
      } catch {
        clearInterval(interval);
      }
    }, 15_000);

    reply.raw.on("close", () => {
      clearInterval(interval);
    });
  });

  app.post("/mcp", async (request, reply) => {
    const body = request.body as McpRequest | undefined;
    if (!body || body.jsonrpc !== "2.0" || !body.method) {
      return reply.status(400).send({ error: "Invalid JSON-RPC request" });
    }

    const requestedVersion = resolveRequestedProtocolVersion(body, request.headers as Record<string, unknown>);
    const hasProtocolHeader = request.headers["mcp-protocol-version"] != null;
    if (hasProtocolHeader && !requestedVersion) {
      return reply.status(400).send({ error: "Invalid or unsupported MCP-Protocol-Version" });
    }

    const negotiatedVersion = requestedVersion ?? DEFAULT_MCP_PROTOCOL_VERSION;
    applyMcpProtocolVersionHeader(reply, negotiatedVersion);

    const response = await handleMcpRequest(
      body,
      toolRegistry,
      negotiatedVersion,
      await resolveMcpToolContext(request, config, sessionService, body.params),
    );
    if (body.id == null) {
      return reply.status(202).send();
    }
    return reply.send(response);
  });

  app.delete("/mcp", async (_request, reply) => reply.status(405).send({ error: "Session termination not supported" }));

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
    const baseUrl = resolveMcpBaseUrl(request as FastifyRequest, config);
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

    const response = await handleMcpRequest(
      body,
      toolRegistry,
      DEFAULT_MCP_PROTOCOL_VERSION,
      await resolveMcpToolContext(request, config, sessionService, body.params),
    );

    // Also push the response via SSE to the connected client
    const client = clients.get(clientId);
    if (client?.alive) {
      client.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
    }

    return reply.send(response);
  });

  app.log.info("MCP routes registered at /mcp, /mcp/sse and /mcp/messages");
}

// ── Request handler ──────────────────────────────────────────────────

export async function handleMcpRequest(
  request: McpRequest,
  toolRegistry: ToolRegistry,
  protocolVersion = DEFAULT_MCP_PROTOCOL_VERSION,
  contextOverrides: McpToolContextOverrides = {},
): Promise<McpResponse> {
  switch (request.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        result: {
          protocolVersion,
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
        id: request.id ?? null,
        result: {
          tools: listToolsForMcp(toolRegistry).map((tool) => ({
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
          id: request.id ?? null,
          result: {
            content: [{ type: "text", text: `Unknown tool: ${toolName}` }],
            isError: true,
          },
        };
      }

      if (!contextOverrides.sessionId) {
        return {
          jsonrpc: "2.0",
          id: request.id ?? null,
          result: {
            content: [{
              type: "text",
              text: "Tool execution requires a sessionId. Authenticate with an active session or provide x-jait-session-id.",
            }],
            isError: true,
          },
        };
      }

      const context: ToolContext = {
        sessionId: contextOverrides.sessionId,
        actionId: uuidv7(),
        workspaceRoot: contextOverrides.workspaceRoot ?? process.cwd(),
        requestedBy: "mcp-client",
      };

      try {
        const result = await tool.execute(args, context);
        return {
          jsonrpc: "2.0",
          id: request.id ?? null,
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
          id: request.id ?? null,
          result: {
            content: [{ type: "text", text: `Tool execution error: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          },
        };
      }
    }

    case "notifications/initialized":
    case "initialized":
    case "ping":
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        result: {},
      };

    default:
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: { code: -32601, message: `Method not found: ${request.method}` },
      };
  }
}
