import { describe, expect, it } from "vitest";
import { createServer } from "./server.js";
import { loadConfig } from "./config.js";
import { ConsentManager } from "./security/consent-manager.js";
import { DeviceRegistry } from "./services/device-registry.js";
import { openDatabase, migrateDatabase } from "./db/index.js";
import { SessionService } from "./services/sessions.js";

const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test" as const,
};

describe("Sprint 12 — mobile gateway flows", () => {
  it("supports mobile discovery + device registration + heartbeat", async () => {
    const consentManager = new ConsentManager();
    const deviceRegistry = new DeviceRegistry();
    const app = await createServer(testConfig, { consentManager, deviceRegistry });

    const discovery = await app.inject({ method: "GET", url: "/api/mobile/discovery" });
    expect(discovery.statusCode).toBe(200);
    const discoveryBody = discovery.json() as { name: string; wsUrl: string };
    expect(discoveryBody.name).toBe("jait-gateway");
    expect(discoveryBody.wsUrl).toContain("/ws");

    const register = await app.inject({
      method: "POST",
      url: "/api/mobile/devices/register",
      payload: {
        id: "device-mobile-1",
        name: "Pixel Test",
        platform: "mobile",
        capabilities: ["voice", "screen-view", "consent"],
      },
    });
    expect(register.statusCode).toBe(200);

    const devices = await app.inject({ method: "GET", url: "/api/mobile/devices" });
    expect(devices.statusCode).toBe(200);
    const devicesBody = devices.json() as { devices: Array<{ id: string; lastSeen: string }> };
    expect(devicesBody.devices).toHaveLength(1);
    const lastSeenBefore = devicesBody.devices[0]!.lastSeen;

    await new Promise((resolve) => setTimeout(resolve, 5));

    const heartbeat = await app.inject({
      method: "POST",
      url: "/api/mobile/devices/device-mobile-1/heartbeat",
    });
    expect(heartbeat.statusCode).toBe(200);
    const heartbeatBody = heartbeat.json() as { device: { lastSeen: string } };
    expect(heartbeatBody.device.lastSeen > lastSeenBefore).toBe(true);

    const health = await app.inject({ method: "GET", url: "/health" });
    const healthBody = health.json() as { devices: number };
    expect(healthBody.devices).toBe(1);

    await app.close();
  });

  it("lists sessions for mobile os-tool endpoint", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const sessionService = new SessionService(db);
    sessionService.create({ name: "Mobile Control Session" });

    const app = await createServer(testConfig, {
      consentManager: new ConsentManager(),
      deviceRegistry: new DeviceRegistry(),
      sessionService,
    });

    const response = await app.inject({ method: "GET", url: "/api/mobile/os-tool/sessions" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { sessions: Array<{ id: string; name: string }> };
    expect(body.sessions.length).toBe(1);
    expect(body.sessions[0]!.name).toBe("Mobile Control Session");

    await app.close();
    sqlite.close();
  });
});
