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
import {
  JAIT_CORE_MCP_SERVER_NAME,
  JAIT_DEFERRED_MCP_SERVER_NAME,
  OMNIROUTE_MCP_SERVER_NAME,
} from "./jait-mcp.js";

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
      name: JAIT_DEFERRED_MCP_SERVER_NAME,
      transport: "http",
      url: url.toString(),
    };
  }

  buildJaitMcpServerRefs(
    config: { host: string; port: number },
    baseUrl?: string,
    context?: { sessionId?: string; projectRoot?: string },
  ): McpServerRef[] {
    const baseRef = this.buildJaitMcpServerRef(config, baseUrl, context);
    const coreUrl = new URL(baseRef.url!);
    const deferredUrl = new URL(baseRef.url!);
    coreUrl.searchParams.set("toolSet", "core");
    deferredUrl.searchParams.set("toolSet", "deferred");

    const refs: McpServerRef[] = [
      { ...baseRef, name: JAIT_CORE_MCP_SERVER_NAME, url: coreUrl.toString() },
      { ...baseRef, name: JAIT_DEFERRED_MCP_SERVER_NAME, url: deferredUrl.toString() },
    ];

    const omniroute = buildOmniRouteMcpServerRef();
    if (omniroute) refs.push(omniroute);

    return refs;
  }
}

/**
 * OmniRoute exposes its own gateway (routing, providers, combos, cache,
 * compression, memory) over MCP. Handing that server to CLI agents alongside
 * Jait's own lets them inspect and steer the router they are being served by.
 *
 * Opt-in via JAIT_OMNIROUTE_MCP=1. Deliberately a separate switch from
 * JAIT_ACP_VIA_OMNIROUTE: routing inference through the router and granting
 * agents control over it are different decisions, and wanting one does not
 * imply wanting the other.
 *
 * Unlike the inference API — which happily serves keyless free-tier providers —
 * the MCP endpoint always requires authentication (verified: it answers 401
 * without a bearer token). Without a key there is nothing useful to hand the
 * agent, so the ref is omitted rather than handed over pre-broken.
 */
export function buildOmniRouteMcpServerRef(
  env: NodeJS.ProcessEnv = process.env,
): McpServerRef | null {
  if (env.JAIT_OMNIROUTE_MCP?.trim().toLowerCase() !== "1") return null;
  const key = env.OMNIROUTE_API_KEY?.trim();
  if (!key) return null;
  // OMNIROUTE_BASE_URL points at the OpenAI-compatible surface (…/v1); the MCP
  // endpoint hangs off the router root instead.
  const root = (env.OMNIROUTE_BASE_URL?.trim() || "http://localhost:20128/v1")
    .replace(/\/+$/, "")
    .replace(/\/v1$/, "");
  return {
    name: OMNIROUTE_MCP_SERVER_NAME,
    transport: "http",
    url: `${root}/api/mcp/stream`,
    headers: { Authorization: `Bearer ${key}` },
  };
}

export { AcpProvider, loadAcpProviderConfigs, type AcpProviderConfig } from "./acp-provider.js";
export { JaitProvider } from "./jait-provider.js";
