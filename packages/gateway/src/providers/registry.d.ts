/**
 * Provider Registry — manages all available CLI provider adapters.
 *
 * Provides a unified interface for:
 *  - Listing available providers
 *  - Getting a specific provider adapter
 *  - Checking availability of all providers
 *  - Building MCP server refs so CLI agents can call Jait's tools
 */
import type { CliProviderAdapter, ProviderId, ProviderInfo, McpServerRef } from "./contracts.js";
export declare class ProviderRegistry {
    private providers;
    constructor();
    /** Register a provider adapter */
    register(adapter: CliProviderAdapter): void;
    /** Get a specific provider adapter */
    get(id: ProviderId): CliProviderAdapter | undefined;
    /** Get a provider or throw */
    getOrThrow(id: ProviderId): CliProviderAdapter;
    /** List all registered provider adapters */
    list(): CliProviderAdapter[];
    /** Check availability of all providers */
    checkAll(): Promise<ProviderInfo[]>;
    /**
     * Build MCP server refs that point back to Jait's gateway.
     * CLI providers use these to discover and call Jait's custom tools.
     *
     * The gateway exposes an MCP-compatible SSE endpoint at /mcp/sse
     * that CLI agents can connect to.
     */
    buildJaitMcpServerRef(config: {
        host: string;
        port: number;
    }): McpServerRef;
}
export { JaitProvider } from "./jait-provider.js";
export { CodexProvider } from "./codex-provider.js";
export { ClaudeCodeProvider } from "./claude-code-provider.js";
//# sourceMappingURL=registry.d.ts.map