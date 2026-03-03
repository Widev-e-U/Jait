/**
 * MCP Tool Bridge — connects external MCP tool servers to Jait's registry.
 *
 * MCP (Model Context Protocol) lets users bring their own tool servers.
 * This bridge:
 *  1. Connects to an MCP server via stdio or HTTP/SSE transport
 *  2. Discovers its tools via `tools/list`
 *  3. Wraps each tool as a ToolDefinition and registers it
 *  4. Proxies tool execution via `tools/call`
 *
 * All MCP tools get tier: "external", category: "external", source: "mcp".
 *
 * Scaffold — transport & full MCP protocol will be implemented when
 * the MCP SDK is integrated. For now this provides the type contracts
 * and registration flow.
 */

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
  transport: "stdio" | "sse";
  /** For stdio: command + args to spawn. For sse: URL to connect to. */
  command?: string;
  args?: string[];
  url?: string;
  /** Environment variables to pass to the MCP server process */
  env?: Record<string, string>;
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

// ── MCP connection (scaffold) ────────────────────────────────────────

export interface McpConnection {
  serverId: string;
  serverName: string;
  status: "connected" | "disconnected" | "error";
  tools: McpToolDescriptor[];
  error?: string;
}

/**
 * Connect to an MCP server and discover its tools.
 *
 * TODO: Implement actual MCP protocol transport. For now this is a
 * scaffold that documents the expected flow and types.
 */
export async function connectMcpServer(
  _config: McpServerConfig,
): Promise<McpConnection> {
  // Scaffold — real implementation will use @modelcontextprotocol/sdk
  return {
    serverId: _config.id,
    serverName: _config.name,
    status: "disconnected",
    tools: [],
    error: "MCP transport not yet implemented — scaffold only",
  };
}

/**
 * Call a tool on an MCP server.
 *
 * TODO: Implement actual MCP tools/call. For now returns an error
 * indicating the scaffold state.
 */
export async function callMcpTool(
  _serverId: string,
  _toolName: string,
  _args: unknown,
): Promise<ToolResult> {
  return {
    ok: false,
    message: `MCP tool execution not yet implemented (server: ${_serverId}, tool: ${_toolName})`,
  };
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
  for (const _name of toRemove) {
    // ToolRegistry doesn't have unregister yet — we'll need to add it
    // For now, tools from disconnected servers will return errors on execute
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
