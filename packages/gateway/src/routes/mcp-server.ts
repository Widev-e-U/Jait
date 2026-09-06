/**
 * MCP HTTP Server — exposes Jait's tool registry as MCP-compatible endpoints.
 *
 * Modern clients such as recent Codex builds expect Streamable HTTP at a
 * single `/mcp` endpoint. Older clients may still use the deprecated split
 * HTTP+SSE transport (`/mcp/sse` + `/mcp/messages`), so we keep both.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";
import { verifyAuthToken, extractBearerToken } from "../security/http-auth.js";
import type { SessionService } from "../services/sessions.js";
import type { SessionStateService } from "../services/session-state.js";
import type { UserService } from "../services/users.js";
import { resolveThreadSelectionDefaults } from "../services/thread-defaults.js";
import { MCP_EXPOSED_CORE_TOOL_NAMES, type ToolRegistry } from "../tools/registry.js";
import type { ToolContext, ToolDefinition, ToolResult } from "../tools/contracts.js";
import { uuidv7 } from "../db/uuidv7.js";
import type { ThreadService } from "../services/threads.js";
import type { WsControlPlane } from "../ws.js";
import type { WsEventType } from "@jait/shared";

type McpToolExecutor = (
  toolName: string,
  input: unknown,
  context: ToolContext,
  options?: { dryRun?: boolean; consentTimeoutMs?: number },
) => Promise<ToolResult>;

interface McpDeps {
  toolRegistry: ToolRegistry;
  toolExecutor?: McpToolExecutor;
  config: AppConfig;
  sessionService?: SessionService;
  userService?: UserService;
  sessionState?: SessionStateService;
  threadService?: ThreadService;
  ws?: WsControlPlane;
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
  projectRoot?: string;
  userId?: string;
  providerId?: string;
  model?: string;
  runtimeMode?: string;
}

type McpToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

const MAX_MCP_TOOL_RESULT_TEXT_CHARS = 30_000;

function capMcpToolResultText(text: string): string {
  if (text.length <= MAX_MCP_TOOL_RESULT_TEXT_CHARS) return text;
  const marker = `\n\n[truncated for model context — ${text.length} characters total]`;
  const tailChars = 4_000;
  const headChars = MAX_MCP_TOOL_RESULT_TEXT_CHARS - tailChars - marker.length;
  return text.slice(0, headChars) + marker + text.slice(-tailChars);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function mcpContentForToolResult(result: ToolResult): McpToolContent[] {
  if (typeof result.data === "string") return [{ type: "text", text: capMcpToolResultText(result.data) }];

  if (isRecord(result.data) && isRecord(result.data.screenshot)) {
    const screenshot = result.data.screenshot;
    const pngBase64 = screenshot.pngBase64;
    if (typeof pngBase64 === "string" && pngBase64.length > 0) {
      const { pngBase64: _pngBase64, ...screenshotMetadata } = screenshot;
      const sanitizedData = { ...result.data, screenshot: screenshotMetadata };
      return [
        {
          type: "text",
          text: capMcpToolResultText(result.message + (Object.keys(sanitizedData).length > 0 ? `\n${JSON.stringify(sanitizedData)}` : "")),
        },
        { type: "image", data: pngBase64, mimeType: "image/png" },
      ];
    }
  }

  return [{
    type: "text",
    text: capMcpToolResultText(result.message + (result.data ? `\n${JSON.stringify(result.data)}` : "")),
  }];
}

const SUPPORTED_MCP_PROTOCOL_VERSIONS = new Set([
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
  "2025-11-25",
]);
const DEFAULT_MCP_PROTOCOL_VERSION = "2025-03-26";
export type McpToolSet = "all" | "core" | "deferred";

function resolveMcpToolSet(query: unknown): McpToolSet {
  if (!query || typeof query !== "object" || Array.isArray(query)) return "all";
  const value = (query as Record<string, unknown>)["toolSet"];
  return value === "core" || value === "deferred" ? value : "all";
}

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

type McpProgressToken = string | number;

function resolveMcpProgressToken(request: McpRequest): McpProgressToken | null {
  const meta = request.params?.["_meta"];
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const token = (meta as Record<string, unknown>)["progressToken"]
    ?? (meta as Record<string, unknown>)["progress_token"];
  return typeof token === "string" || typeof token === "number" ? token : null;
}

function createMcpProgressNotification(
  progressToken: McpProgressToken,
  progress: number,
  message: string,
): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    method: "notifications/progress",
    params: { progressToken, progress, message },
  };
}

function resolveMcpToolContextOverrides(
  request: Pick<FastifyRequest, "headers" | "query"> | null,
  params?: Record<string, unknown>,
): McpToolContextOverrides {
  const headers = request?.headers as Record<string, unknown> | undefined;
  const query = request?.query as Record<string, unknown> | undefined;
  const args = params?.["arguments"] && typeof params["arguments"] === "object"
    ? params["arguments"] as Record<string, unknown>
    : undefined;
  return {
    sessionId:
      readOptionalString(headers?.["x-jait-session-id"])
      ?? readOptionalString(query?.["sessionId"])
      ?? readOptionalString(params?.["sessionId"])
      ?? readOptionalString(args?.["sessionId"]),
    projectRoot:
      readOptionalString(headers?.["x-jait-project-root"])
      ?? readOptionalString(query?.["projectRoot"])
      ?? readOptionalString(params?.["projectRoot"])
      ?? readOptionalString(args?.["projectRoot"]),
    providerId:
      readOptionalString(headers?.["x-jait-provider-id"])
      ?? readOptionalString(query?.["providerId"])
      ?? readOptionalString(params?.["providerId"])
      ?? readOptionalString(args?.["providerId"]),
    model:
      readOptionalString(headers?.["x-jait-model"])
      ?? readOptionalString(query?.["model"])
      ?? readOptionalString(params?.["model"])
      ?? readOptionalString(args?.["model"]),
    runtimeMode:
      readOptionalString(headers?.["x-jait-runtime-mode"])
      ?? readOptionalString(query?.["runtimeMode"])
      ?? readOptionalString(params?.["runtimeMode"])
      ?? readOptionalString(args?.["runtimeMode"]),
  };
}

async function resolveMcpToolContext(
  request: FastifyRequest | null,
  config: AppConfig,
  sessionService?: SessionService,
  userService?: UserService,
  sessionState?: SessionStateService,
  params?: Record<string, unknown>,
): Promise<McpToolContextOverrides> {
  const overrides = resolveMcpToolContextOverrides(request, params);
  if (!request) {
    return inferSessionBackedToolContext(overrides, sessionService, userService, sessionState);
  }

  const token = extractBearerToken(request.headers.authorization);
  const user = token ? await verifyAuthToken(token, config.jwtSecret) : null;
  const authBackedOverrides = user
    ? (overrides.sessionId
      ? {
          ...overrides,
          userId: user.id,
        }
      : !sessionService
        ? { ...overrides, userId: user.id }
        : (() => {
            const session = sessionService.lastActive(user.id);
            if (!session?.id) return { ...overrides, userId: user.id };
            return {
              ...overrides,
              sessionId: session.id,
              projectRoot: overrides.projectRoot ?? session.projectPath ?? undefined,
              userId: user.id,
            };
          })())
    : overrides;

  if (!user && !authBackedOverrides.sessionId && sessionService) {
    const session = sessionService.lastActive();
    if (session?.id) {
      return inferSessionBackedToolContext({
        ...authBackedOverrides,
        sessionId: session.id,
        projectRoot: authBackedOverrides.projectRoot ?? session.projectPath ?? undefined,
      }, sessionService, userService, sessionState);
    }
  }

  return inferSessionBackedToolContext(authBackedOverrides, sessionService, userService, sessionState);
}

function inferSessionBackedToolContext(
  overrides: McpToolContextOverrides,
  sessionService?: SessionService,
  userService?: UserService,
  sessionState?: SessionStateService,
): McpToolContextOverrides {
  const session = overrides.sessionId && sessionService
    ? sessionService.getById(overrides.sessionId)
    : null;
  const userId = overrides.userId ?? session?.userId ?? undefined;
  const projectRoot = overrides.projectRoot ?? session?.projectPath ?? undefined;

  const defaults = resolveThreadSelectionDefaults({
    userId,
    sessionId: overrides.sessionId,
    userService,
    sessionState,
  });

  return {
    ...overrides,
    userId,
    projectRoot,
    providerId: overrides.providerId ?? defaults.providerId,
    model: overrides.model ?? defaults.model,
    runtimeMode: overrides.runtimeMode ?? defaults.runtimeMode,
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

function appendMcpContextQuery(baseUrl: string, query?: Record<string, unknown>): string {
  const sessionId = readOptionalString(query?.["sessionId"]);
  const projectRoot = readOptionalString(query?.["projectRoot"]);
  const toolSet = resolveMcpToolSet(query);
  if (!sessionId && !projectRoot && toolSet === "all") return baseUrl;

  const url = new URL(baseUrl);
  if (sessionId) url.searchParams.set("sessionId", sessionId);
  if (projectRoot) url.searchParams.set("projectRoot", projectRoot);
  if (toolSet !== "all") url.searchParams.set("toolSet", toolSet);
  return url.toString();
}

export function listToolsForMcp(
  toolRegistry: ToolRegistry,
  toolSet: McpToolSet = "all",
): ToolDefinition[] {
  const tools = toolRegistry.listForMcp();
  if (toolSet === "core") {
    return tools.filter((tool) => MCP_EXPOSED_CORE_TOOL_NAMES.has(tool.name));
  }
  if (toolSet === "deferred") {
    return tools.filter((tool) => !MCP_EXPOSED_CORE_TOOL_NAMES.has(tool.name));
  }
  return tools;
}

// ── Route registration ───────────────────────────────────────────────

export function registerMcpRoutes(app: FastifyInstance, deps: McpDeps): void {
  const { toolRegistry, toolExecutor, config, sessionService, userService, sessionState } = deps;

  // Callback for post-tool-execution side effects (e.g., thread todo activities)
  const onToolExecuted: McpToolExecutedCallback = (toolName, result, context) => {
    if (toolName !== "todo" || !result.ok || !result.data || typeof result.data !== "object" || !("items" in result.data)) {
      return;
    }

    const items = (result.data as { items: unknown }).items;
    if (!Array.isArray(items)) return;

    if (sessionState) {
      try {
        sessionState.set(context.sessionId, { "todo_list": items });
      } catch {
        /* ignore session state sync errors */
      }
    }

    if (deps.ws) {
      deps.ws.broadcast(context.sessionId, {
        type: "ui.state-sync",
        sessionId: context.sessionId,
        timestamp: new Date().toISOString(),
        payload: { key: "todo_list", value: items },
      });
    }

    // Broadcast todo list updates as thread activities
    if (deps.threadService) {
      const thread = deps.threadService.getById(context.sessionId);
      if (!thread) return;
      const activity = deps.threadService.addActivity(context.sessionId, "todo", "Todo list updated", { items });
      if (deps.ws) {
        deps.ws.broadcastAll({
          type: "thread.activity" as WsEventType,
          sessionId: "",
          timestamp: new Date().toISOString(),
          payload: { threadId: context.sessionId, activity },
        });
      }
    }
  };

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

  const handleStreamableMcpPost = async (request: FastifyRequest, reply: FastifyReply) => {
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
    const context = await resolveMcpToolContext(request, config, sessionService, userService, sessionState, body.params);
    const toolSet = resolveMcpToolSet(request.query);
    const progressToken = resolveMcpProgressToken(body);
    const acceptsEventStream = String(request.headers.accept ?? "").includes("text/event-stream");

    if (body.id != null && body.method === "tools/call" && progressToken != null && acceptsEventStream) {
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "MCP-Protocol-Version": negotiatedVersion,
      });
      let progress = 0;
      const response = await handleMcpRequest(
        body,
        toolRegistry,
        negotiatedVersion,
        context,
        onToolExecuted,
        (chunk) => {
          progress += 1;
          const notification = createMcpProgressNotification(progressToken, progress, chunk);
          reply.raw.write(`event: message\ndata: ${JSON.stringify(notification)}\n\n`);
        },
        toolSet,
        toolExecutor,
      );
      reply.raw.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
      reply.raw.end();
      return reply;
    }

    const response = await handleMcpRequest(
      body,
      toolRegistry,
      negotiatedVersion,
      context,
      onToolExecuted,
      undefined,
      toolSet,
      toolExecutor,
    );
    if (body.id == null) {
      return reply.status(202).send();
    }
    return reply.send(response);
  };

  app.post("/mcp", handleStreamableMcpPost);

  // Compatibility for older Jait/Codex configs that stored the legacy SSE URL
  // in a Streamable HTTP `url` field. Modern Codex POSTs JSON-RPC to that URL.
  app.post("/mcp/sse", handleStreamableMcpPost);

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
    const endpointUrl = appendMcpContextQuery(
      `${baseUrl}/mcp/messages?clientId=${encodeURIComponent(clientId)}`,
      request.query as Record<string, unknown> | undefined,
    );
    write(`event: endpoint\ndata: ${endpointUrl}\n\n`);

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

    const client = clients.get(clientId);
    const progressToken = resolveMcpProgressToken(body);
    let progress = 0;
    const response = await handleMcpRequest(
      body,
      toolRegistry,
      DEFAULT_MCP_PROTOCOL_VERSION,
      await resolveMcpToolContext(request, config, sessionService, userService, sessionState, body.params),
      onToolExecuted,
      progressToken != null && client?.alive
        ? (chunk) => {
            progress += 1;
            const notification = createMcpProgressNotification(progressToken, progress, chunk);
            client.write(`event: message\ndata: ${JSON.stringify(notification)}\n\n`);
          }
        : undefined,
      resolveMcpToolSet(request.query),
      toolExecutor,
    );

    // Also push the response via SSE to the connected client
    if (client?.alive) {
      client.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
    }

    return reply.send(response);
  });

  app.log.info("MCP routes registered at /mcp, /mcp/sse and /mcp/messages");
}

// ── Request handler ──────────────────────────────────────────────────

export type McpToolExecutedCallback = (toolName: string, result: ToolResult, context: ToolContext) => void;
export type McpToolProgressCallback = (chunk: string) => void;

export async function handleMcpRequest(
  request: McpRequest,
  toolRegistry: ToolRegistry,
  protocolVersion = DEFAULT_MCP_PROTOCOL_VERSION,
  contextOverrides: McpToolContextOverrides = {},
  onToolExecuted?: McpToolExecutedCallback,
  onProgress?: McpToolProgressCallback,
  toolSet: McpToolSet = "all",
  toolExecutor?: McpToolExecutor,
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
          instructions: "Prefer Jait tools whenever they directly match the user request. The todo and user_ask tools are always available for multi-step tracking and real user decisions. Use tools_search with one broad natural-language query to find additional relevant Jait tools before claiming a capability is unavailable.",
        },
      };

    case "tools/list":
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        result: {
          tools: listToolsForMcp(toolRegistry, toolSet).map((tool) => {
              const hasProperties = Object.keys(tool.parameters.properties ?? {}).length > 0;
              const isReadOnly = tool.risk === "low" || tool.category === "gateway" || tool.name === "gateway.status";
              return {
                name: tool.name.replace(/\./g, "_"),
                ...(tool.displayName ? { title: tool.displayName } : {}),
                description: tool.description,
                inputSchema: hasProperties
                  ? { ...tool.parameters, type: "object" }
                  : { type: "object", properties: {} },
                annotations: {
                  ...(isReadOnly ? { readOnlyHint: true, idempotentHint: true } : {}),
                  ...(tool.risk === "high" ? { destructiveHint: true } : {}),
                },
              };
            }),
        },
      };

    case "tools/call": {
      const params = request.params ?? {};
      const rawToolName = String(params["name"] ?? "");
      // MCP clients receive underscore-based names; map back to dotted internal names
      const toolName = rawToolName.replace(/_/g, ".");
      const args = params["arguments"] ?? {};

      let tool = toolRegistry.get(toolName);
      // Fallback: try the raw name as-is (in case a tool actually uses underscores)
      if (!tool && toolName !== rawToolName) tool = toolRegistry.get(rawToolName);
      if (tool) {
        const isCoreTool = MCP_EXPOSED_CORE_TOOL_NAMES.has(tool.name);
        if ((toolSet === "core" && !isCoreTool) || (toolSet === "deferred" && isCoreTool)) {
          tool = undefined;
        }
      }
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
        projectRoot: contextOverrides.projectRoot ?? process.cwd(),
        requestedBy: "mcp-client",
        userId: contextOverrides.userId,
        providerId: contextOverrides.providerId,
        model: contextOverrides.model,
        runtimeMode: contextOverrides.runtimeMode,
        onOutputChunk: onProgress,
      };

      try {
        const result = toolExecutor
          ? await toolExecutor(tool.name, args, context)
          : await tool.execute(args, context);
        onToolExecuted?.(toolName, result, context);
        return {
          jsonrpc: "2.0",
          id: request.id ?? null,
          result: {
            content: mcpContentForToolResult(result),
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
