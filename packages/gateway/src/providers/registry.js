/**
 * Provider Registry — manages all available CLI provider adapters.
 *
 * Provides a unified interface for:
 *  - Listing available providers
 *  - Getting a specific provider adapter
 *  - Checking availability of all providers
 *  - Building MCP server refs so CLI agents can call Jait's tools
 */
export class ProviderRegistry {
    providers = new Map();
    constructor() {
        // Providers are registered externally via register()
    }
    /** Register a provider adapter */
    register(adapter) {
        this.providers.set(adapter.id, adapter);
    }
    /** Get a specific provider adapter */
    get(id) {
        return this.providers.get(id);
    }
    /** Get a provider or throw */
    getOrThrow(id) {
        const provider = this.providers.get(id);
        if (!provider)
            throw new Error(`Unknown provider: ${id}`);
        return provider;
    }
    /** List all registered provider adapters */
    list() {
        return [...this.providers.values()];
    }
    /** Check availability of all providers */
    async checkAll() {
        const results = await Promise.allSettled([...this.providers.values()].map((p) => p.checkAvailability()));
        for (const result of results) {
            if (result.status === "rejected") {
                console.error(`Provider availability check failed:`, result.reason);
            }
        }
        return [...this.providers.values()].map((p) => ({ ...p.info }));
    }
    /**
     * Build MCP server refs that point back to Jait's gateway.
     * CLI providers use these to discover and call Jait's custom tools.
     *
     * The gateway exposes an MCP-compatible SSE endpoint at /mcp/sse
     * that CLI agents can connect to.
     */
    buildJaitMcpServerRef(config) {
        const host = config.host === "0.0.0.0" ? "127.0.0.1" : config.host;
        const baseUrl = `http://${host}:${config.port}`;
        return {
            name: "jait",
            transport: "sse",
            url: `${baseUrl}/mcp/sse`,
        };
    }
}
export { JaitProvider } from "./jait-provider.js";
export { CodexProvider } from "./codex-provider.js";
export { ClaudeCodeProvider } from "./claude-code-provider.js";
//# sourceMappingURL=registry.js.map