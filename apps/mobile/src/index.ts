import { JaitClient } from "@jait/api-client";

export interface MobileBootstrapResult {
  apiBaseUrl: string;
  wsUrl: string;
  connected: boolean;
}

export async function bootstrapMobileClient(gatewayUrl: string): Promise<MobileBootstrapResult> {
  const discoveryRes = await fetch(`${gatewayUrl}/api/mobile/discovery`);
  if (!discoveryRes.ok) {
    throw new Error(`Gateway discovery failed: ${discoveryRes.status}`);
  }

  const discovery = (await discoveryRes.json()) as { baseUrl: string; wsUrl: string };
  const client = new JaitClient({ baseUrl: discovery.baseUrl, wsUrl: discovery.wsUrl });
  const health = await client.health();

  return {
    apiBaseUrl: discovery.baseUrl,
    wsUrl: discovery.wsUrl,
    connected: health.healthy,
  };
}
