/** Detect the Capacitor platform we're running on. */
function detectPlatform() {
    if (typeof window !== "undefined" && window["Capacitor"]) {
        const cap = window["Capacitor"];
        const p = cap["getPlatform"];
        const platform = p?.() ?? "web";
        if (platform === "android")
            return "capacitor-android";
        if (platform === "ios")
            return "capacitor-ios";
    }
    return "browser";
}
export async function bootstrapMobileClient(gatewayUrl) {
    const discoveryRes = await fetch(`${gatewayUrl}/api/mobile/discovery`);
    if (!discoveryRes.ok) {
        throw new Error(`Gateway discovery failed: ${discoveryRes.status}`);
    }
    const discovery = (await discoveryRes.json());
    const healthRes = await fetch(`${discovery.baseUrl}/health`);
    const health = (await healthRes.json());
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
//# sourceMappingURL=mobile-bootstrap.js.map