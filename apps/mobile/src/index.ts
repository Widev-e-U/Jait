import { JaitClient } from "@jait/api-client";

export interface MobileBootstrapResult {
  apiBaseUrl: string;
  wsUrl: string;
  connected: boolean;
  platform: "capacitor-android" | "capacitor-ios" | "browser";
}

/** Detect the Capacitor platform we're running on. */
function detectPlatform(): MobileBootstrapResult["platform"] {
  if (typeof window !== "undefined" && (window as Record<string, unknown>)["Capacitor"]) {
    const cap = (window as Record<string, unknown>)["Capacitor"] as Record<string, unknown>;
    const p = cap["getPlatform"] as (() => string) | undefined;
    const platform = p?.() ?? "web";
    if (platform === "android") return "capacitor-android";
    if (platform === "ios") return "capacitor-ios";
  }
  return "browser";
}

export async function bootstrapMobileClient(gatewayUrl: string): Promise<MobileBootstrapResult> {
  const discoveryRes = await fetch(`${gatewayUrl}/api/mobile/discovery`);
  if (!discoveryRes.ok) {
    throw new Error(`Gateway discovery failed: ${discoveryRes.status}`);
  }

  const discovery = (await discoveryRes.json()) as { baseUrl: string; wsUrl: string };
  const client = new JaitClient({ baseUrl: discovery.baseUrl, wsUrl: discovery.wsUrl });
  const health = await client.health();

  const platform = detectPlatform();

  // Register this device with the gateway
  const deviceId = `mobile-${platform}-${Date.now().toString(36)}`;
  await fetch(`${gatewayUrl}/api/mobile/devices/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: deviceId,
      name: `Jait Mobile (${platform})`,
      platform: "mobile",
      capabilities: ["screen-view", "consent-approve", "notifications"],
    }),
  });

  return {
    apiBaseUrl: discovery.baseUrl,
    wsUrl: discovery.wsUrl,
    connected: health.healthy,
    platform,
  };
}

export { detectPlatform };
