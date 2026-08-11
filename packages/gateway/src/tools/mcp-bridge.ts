/**
 * MCP Tool Bridge — connects external MCP tool servers to Jait's registry.
 *
 * MCP (Model Context Protocol) lets users bring their own tool servers.
 * This bridge:
 *  1. Connects to an MCP server via stdio, SSE, or Streamable HTTP transport
 *  2. Discovers its tools via `tools/list`
 *  3. Wraps each tool as a ToolDefinition and registers it
 *  4. Proxies tool execution via `tools/call`
 *
 * All MCP tools get tier: "external", category: "external", source: "mcp".
 *
 * Uses the official @modelcontextprotocol/sdk (Client + transports).
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

import type {
  ToolDefinition,
  ToolParametersSchema,
  ToolContext,
  ToolResult,
} from "./contracts.js";
import type { ToolRegistry } from "./registry.js";

// ── MCP server configuration ─────────────────────────────────────────

export interface McpServerConfig {
  /** Unique identifier for this MCP server (e.g. "github", "slack") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Transport type */
  transport: "stdio" | "sse" | "streamable-http";
  /** For stdio: command + args to spawn. For sse/streamable-http: URL to connect to. */
  command?: string;
  args?: string[];
  url?: string;
  /** Environment variables to pass to the MCP server process */
  env?: Record<string, string>;
  /** Working directory for stdio servers */
  cwd?: string;
  /** Whether the server is enabled (default true) */
  enabled?: boolean;
}

/** Describes a tool advertised by an MCP server */
export interface McpToolDescriptor {
  /** Tool name as reported by the MCP server */
  name: string;
  /** Description from the MCP server */
  description: string;
  /** JSON Schema for the tool's input */
  inputSchema: ToolParametersSchema;
}

// ── MCP connection ────────────────────────────────────────────────────

export interface McpConnection {
  serverId: string;
  serverName: string;
  status: "connected" | "disconnected" | "error";
  tools: McpToolDescriptor[];
  error?: string;
}

/**
 * Live MCP clients keyed by server id. Kept so `callMcpTool` can route
 * execution to the correct connected server.
 */
const clients = new Map<string, Client>();

/** Build an SDK transport from a server config. */
function buildTransport(config: McpServerConfig) {
  switch (config.transport) {
    case "stdio": {
      if (!config.command) {
        throw new Error(`MCP server '${config.id}' (stdio) requires a 'command'`);
      }
      return new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: config.env,
        cwd: config.cwd,
      });
    }
    case "sse": {
      if (!config.url) {
        throw new Error(`MCP server '${config.id}' (sse) requires a 'url'`);
      }
      return new SSEClientTransport(new URL(config.url));
    }
    case "streamable-http": {
      if (!config.url) {
        throw new Error(`MCP server '${config.id}' (streamable-http) requires a 'url'`);
      }
      return new StreamableHTTPClientTransport(new URL(config.url));
    }
    default: {
      const exhaustive: never = config.transport;
      throw new Error(`Unsupported MCP transport: ${String(exhaustive)}`);
    }
  }
}

/** Convert an SDK Tool into a Jait McpToolDescriptor. */
function toMcpToolDescriptor(tool: Tool): McpToolDescriptor {
  return {
    name: tool.name,
    description: tool.description ?? "",
    inputSchema: (tool.inputSchema ?? { type: "object", properties: {} }) as ToolParametersSchema,
  };
}

/**
 * Connect to an MCP server and discover its tools.
 */
export async function connectMcpServer(
  config: McpServerConfig,
): Promise<McpConnection> {
  const base: McpConnection = {
    serverId: config.id,
    serverName: config.name,
    status: "disconnected",
    tools: [],
  };

  try {
    const transport = buildTransport(config);
    const client = new Client(
      { name: "jait-gateway", version: "1.0.0" },
      { capabilities: {} },
    );

    await client.connect(transport);

    const { tools } = await client.listTools();
    const descriptors = (tools ?? []).map(toMcpToolDescriptor);

    // Close any previous client for this server before storing the new one.
    const previous = clients.get(config.id);
    if (previous) {
      try {
        await previous.close();
      } catch {
        // ignore close errors on stale clients
      }
    }
    clients.set(config.id, client);

    return { ...base, status: "connected", tools: descriptors };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ...base, status: "error", error: message };
  }
}

/** Serialize an MCP CallToolResult into a Jait ToolResult. */
function serializeToolResult(result: {
  content?: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
  structuredContent?: unknown;
  toolResult?: unknown;
}): ToolResult {
  // SDK 1.30+ may return a task-based `toolResult` variant instead of `content`.
  if (result.toolResult !== undefined) {
    const message =
      typeof result.toolResult === "string"
        ? result.toolResult
        : JSON.stringify(result.toolResult);
    return {
      ok: result.isError !== true,
      message,
      data: result.toolResult,
    };
  }

  const textParts: string[] = [];
  for (const block of result.content ?? []) {
    if (block.type === "text" && typeof block.text === "string") {
      textParts.push(block.text);
    } else if (block.type === "resource") {
      textParts.push(JSON.stringify(block));
    } else {
      textParts.push(JSON.stringify(block));
    }
  }
  const message = textParts.join("\n") || "MCP tool returned no text content";
  const data =
    result.structuredContent !== undefined
      ? result.structuredContent
      : textParts.length > 0
        ? textParts
        : undefined;

  return {
    ok: result.isError !== true,
    message,
    data,
  };
}

/**
 * Call a tool on an MCP server.
 */
export async function callMcpTool(
  serverId: string,
  toolName: string,
  args: unknown,
): Promise<ToolResult> {
  const client = clients.get(serverId);
  if (!client) {
    return {
      ok: false,
      message: `MCP server '${serverId}' is not connected`,
    };
  }

  try {
    const result = await client.callTool({
      name: toolName,
      arguments: (args ?? {}) as Record<string, unknown>,
    });
    return serializeToolResult(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message };
  }
}

/** Disconnect and close a server's client, removing it from the map. */
export async function disconnectMcpServer(serverId: string): Promise<void> {
  const client = clients.get(serverId);
  if (client) {
    try {
      await client.close();
    } catch {
      // ignore close errors
    }
    clients.delete(serverId);
  }
}

// ── Register MCP tools into ToolRegistry ─────────────────────────────

/**
 * Wraps an MCP tool descriptor as a Jait ToolDefinition and registers it.
 *
 * The tool name is prefixed with the server id to avoid collisions:
 *   e.g. "github:create_issue" → registered as "mcp.github.create_issue"
 */
export function wrapMcpTool(
  serverId: string,
  descriptor: McpToolDescriptor,
): ToolDefinition {
  const jaitName = `mcp.${serverId}.${descriptor.name}`;
  return {
    name: jaitName,
    description: `[MCP: ${serverId}] ${descriptor.description}`,
    parameters: descriptor.inputSchema,
    tier: "external",
    category: "external",
    source: "mcp",
    sourceMetadata: { kind: "mcp", serverId, serverName: serverId },
    discovery: {
      aliases: [descriptor.name, serverId],
      capabilities: [descriptor.description],
    },
    async execute(input: unknown, _context: ToolContext): Promise<ToolResult> {
      return callMcpTool(serverId, descriptor.name, input);
    },
  };
}

/**
 * Register all tools from an MCP server connection into a ToolRegistry.
 * Returns the number of tools registered.
 */
export function registerMcpTools(
  registry: ToolRegistry,
  connection: McpConnection,
): number {
  let count = 0;
  for (const descriptor of connection.tools) {
    const tool = wrapMcpTool(connection.serverId, descriptor);
    registry.register(tool);
    count++;
  }
  return count;
}

/**
 * Unregister all MCP tools from a specific server.
 */
export function unregisterMcpTools(
  registry: ToolRegistry,
  serverId: string,
): number {
  const prefix = `mcp.${serverId}.`;
  const toRemove = registry.listNames().filter((n) => n.startsWith(prefix));
  for (const name of toRemove) {
    registry.unregister(name);
  }
  return toRemove.length;
}

// ── MCP server manager ───────────────────────────────────────────────

/**
 * Manages multiple MCP server connections.
 * Tracks connection state, provides reconnection, and manages tool lifecycle.
 */
export class McpManager {
  private connections = new Map<string, McpConnection>();
  private configs = new Map<string, McpServerConfig>();

  constructor(private readonly registry: ToolRegistry) {}

  /** Add an MCP server configuration */
  addServer(config: McpServerConfig): void {
    this.configs.set(config.id, config);
  }

  /** Remove an MCP server */
  removeServer(serverId: string): void {
    this.disconnect(serverId);
    this.configs.delete(serverId);
  }

  /** Connect to a specific server and register its tools */
  async connect(serverId: string): Promise<McpConnection> {
    const config = this.configs.get(serverId);
    if (!config) {
      return {
        serverId,
        serverName: serverId,
        status: "error",
        tools: [],
        error: `No config found for MCP server '${serverId}'`,
      };
    }

    const connection = await connectMcpServer(config);
    this.connections.set(serverId, connection);

    if (connection.status === "connected") {
      registerMcpTools(this.registry, connection);
    }

    return connection;
  }

  /** Disconnect from a specific server */
  disconnect(serverId: string): void {
    unregisterMcpTools(this.registry, serverId);
    this.connections.delete(serverId);
    void disconnectMcpServer(serverId);
  }

  /** Connect to all configured servers */
  async connectAll(): Promise<McpConnection[]> {
    const results: McpConnection[] = [];
    for (const config of this.configs.values()) {
      if (config.enabled !== false) {
        results.push(await this.connect(config.id));
      }
    }
    return results;
  }

  /** Get connection status for all servers */
  getStatus(): Array<{
    id: string;
    name: string;
    status: McpConnection["status"];
    toolCount: number;
    error?: string;
  }> {
    const out: Array<{
      id: string;
      name: string;
      status: McpConnection["status"];
      toolCount: number;
      error?: string;
    }> = [];

    for (const config of this.configs.values()) {
      const conn = this.connections.get(config.id);
      out.push({
        id: config.id,
        name: config.name,
        status: conn?.status ?? "disconnected",
        toolCount: conn?.tools.length ?? 0,
        error: conn?.error,
      });
    }

    return out;
  }

  /** Get all server configs */
  getConfigs(): McpServerConfig[] {
    return [...this.configs.values()];
  }
}
