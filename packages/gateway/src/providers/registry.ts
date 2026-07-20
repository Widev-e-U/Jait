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

  async unregister(id: ProviderId): Promise<boolean> {
    const provider = this.providers.get(id);
    if (!provider) return false;
    this.providers.delete(id);
    await provider.dispose?.();
    return true;
  }

  /** Get a specific provider adapter */
  get(id: ProviderId): CliProviderAdapter | undefined {
    return this.providers.get(id);
  }

  getForUser(id: ProviderId, userId: string): CliProviderAdapter | undefined {
    const provider = this.providers.get(id);
    if (!provider || (provider.ownerUserId && provider.ownerUserId !== userId)) return undefined;
    return provider;
  }

  isVisibleTo(id: ProviderId, userId: string): boolean {
    return Boolean(this.getForUser(id, userId));
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
  buildJaitMcpServerRef(
    config: { host: string; port: number },
    baseUrl?: string,
    context?: { sessionId?: string; projectRoot?: string },
  ): McpServerRef {
    const normalizedBaseUrl = baseUrl?.trim().replace(/\/+$/, "");
    const host = config.host === "0.0.0.0" ? "127.0.0.1" : config.host;
    const resolvedBaseUrl = normalizedBaseUrl || `http://${host}:${config.port}`;
    const url = new URL("/mcp", `${resolvedBaseUrl}/`);

    if (context?.sessionId) {
      url.searchParams.set("sessionId", context.sessionId);
    }
    if (context?.projectRoot) {
      url.searchParams.set("projectRoot", context.projectRoot);
    }

    return {
      name: "jait",
      transport: "http",
      url: url.toString(),
    };
  }
}

export { AcpProvider, loadAcpProviderConfigs, type AcpProviderConfig } from "./acp-provider.js";
export { JaitProvider } from "./jait-provider.js";
