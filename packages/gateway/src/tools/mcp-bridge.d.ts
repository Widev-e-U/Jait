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
import type { ToolDefinition, ToolParametersSchema, ToolResult } from "./contracts.js";
import type { ToolRegistry } from "./registry.js";
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
export declare function connectMcpServer(_config: McpServerConfig): Promise<McpConnection>;
/**
 * Call a tool on an MCP server.
 *
 * TODO: Implement actual MCP tools/call. For now returns an error
 * indicating the scaffold state.
 */
export declare function callMcpTool(_serverId: string, _toolName: string, _args: unknown): Promise<ToolResult>;
/**
 * Wraps an MCP tool descriptor as a Jait ToolDefinition and registers it.
 *
 * The tool name is prefixed with the server id to avoid collisions:
 *   e.g. "github:create_issue" → registered as "mcp.github.create_issue"
 */
export declare function wrapMcpTool(serverId: string, descriptor: McpToolDescriptor): ToolDefinition;
/**
 * Register all tools from an MCP server connection into a ToolRegistry.
 * Returns the number of tools registered.
 */
export declare function registerMcpTools(registry: ToolRegistry, connection: McpConnection): number;
/**
 * Unregister all MCP tools from a specific server.
 */
export declare function unregisterMcpTools(registry: ToolRegistry, serverId: string): number;
/**
 * Manages multiple MCP server connections.
 * Tracks connection state, provides reconnection, and manages tool lifecycle.
 */
export declare class McpManager {
    private readonly registry;
    private connections;
    private configs;
    constructor(registry: ToolRegistry);
    /** Add an MCP server configuration */
    addServer(config: McpServerConfig): void;
    /** Remove an MCP server */
    removeServer(serverId: string): void;
    /** Connect to a specific server and register its tools */
    connect(serverId: string): Promise<McpConnection>;
    /** Disconnect from a specific server */
    disconnect(serverId: string): void;
    /** Connect to all configured servers */
    connectAll(): Promise<McpConnection[]>;
    /** Get connection status for all servers */
    getStatus(): Array<{
        id: string;
        name: string;
        status: McpConnection["status"];
        toolCount: number;
        error?: string;
    }>;
    /** Get all server configs */
    getConfigs(): McpServerConfig[];
}
//# sourceMappingURL=mcp-bridge.d.ts.map