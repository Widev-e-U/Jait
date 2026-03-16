/**
 * Provider Registry — manages all available CLI provider adapters.
 *
 * Provides a unified interface for:
 *  - Listing available providers
 *  - Getting a specific provider adapter
 *  - Checking availability of all providers
 *  - Building MCP server refs so CLI agents can call Jait's tools
 */

import type {
  CliProviderAdapter,
  ProviderId,
  ProviderInfo,
  McpServerRef,
} from "./contracts.js";

export class ProviderRegistry {
  private providers = new Map<ProviderId, CliProviderAdapter>();

  constructor() {
    // Providers are registered externally via register()
  }

  /** Register a provider adapter */
  register(adapter: CliProviderAdapter): void {
    this.providers.set(adapter.id, adapter);
  }

  /** Get a specific provider adapter */
  get(id: ProviderId): CliProviderAdapter | undefined {
    return this.providers.get(id);
  }

  /** Get a provider or throw */
  getOrThrow(id: ProviderId): CliProviderAdapter {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Unknown provider: ${id}`);
    return provider;
  }

  /** List all registered provider adapters */
  list(): CliProviderAdapter[] {
    return [...this.providers.values()];
  }

  /** Check availability of all providers */
  async checkAll(): Promise<ProviderInfo[]> {
    const results = await Promise.allSettled(
      [...this.providers.values()].map((p) => p.checkAvailability()),
    );
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
   * The gateway exposes a Streamable HTTP MCP endpoint at /mcp.
   * that CLI agents can connect to.
   */
  buildJaitMcpServerRef(config: { host: string; port: number }, baseUrl?: string): McpServerRef {
    const normalizedBaseUrl = baseUrl?.trim().replace(/\/+$/, "");
    const host = config.host === "0.0.0.0" ? "127.0.0.1" : config.host;
    const resolvedBaseUrl = normalizedBaseUrl || `http://${host}:${config.port}`;

    return {
      name: "jait",
      transport: "sse",
      url: `${resolvedBaseUrl}/mcp`,
    };
  }
}

export { JaitProvider } from "./jait-provider.js";
export { CodexProvider } from "./codex-provider.js";
export { ClaudeCodeProvider } from "./claude-code-provider.js";
