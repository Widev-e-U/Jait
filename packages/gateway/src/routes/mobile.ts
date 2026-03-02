import type { FastifyInstance } from "fastify";
import type { ConsentManager } from "../security/consent-manager.js";
import type { DeviceRegistry } from "../services/device-registry.js";
import type { SessionService } from "../services/sessions.js";

interface MobileRouteDeps {
  deviceRegistry: DeviceRegistry;
  consentManager: ConsentManager;
  sessionService?: SessionService;
}

export function registerMobileRoutes(app: FastifyInstance, deps: MobileRouteDeps) {
  app.get("/api/mobile/discovery", async (request) => {
    const host = request.hostname;
    const protocol = request.protocol;
    return {
      name: "jait-gateway",
      discoveredAt: new Date().toISOString(),
      baseUrl: `${protocol}://${host}`,
      wsUrl: `${protocol === "https" ? "wss" : "ws"}://${host}/ws`,
    };
  });

  app.post("/api/mobile/devices/register", async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const id = String(body["id"] ?? "").trim();
    const name = String(body["name"] ?? "").trim();
    const platform = body["platform"];
    const capabilities = Array.isArray(body["capabilities"])
      ? body["capabilities"].map((x) => String(x))
      : [];

    if (!id || !name || (platform !== "mobile" && platform !== "desktop" && platform !== "browser")) {
      return reply.code(400).send({ error: "Invalid device registration payload" });
    }

    const device = deps.deviceRegistry.register({
      id,
      name,
      platform,
      capabilities,
    });
    return { ok: true, device };
  });

  app.post("/api/mobile/devices/:deviceId/heartbeat", async (request, reply) => {
    const { deviceId } = request.params as { deviceId: string };
    const device = deps.deviceRegistry.heartbeat(deviceId);
    if (!device) {
      return reply.code(404).send({ error: "Device not found" });
    }
    return { ok: true, device };
  });

  app.get("/api/mobile/devices", async () => ({ devices: deps.deviceRegistry.list() }));

  app.get("/api/mobile/os-tool/sessions", async () => {
    const sessions = deps.sessionService ? deps.sessionService.list() : [];
    return { sessions };
  });

  app.get("/api/mobile/consent/pending", async () => ({
    requests: deps.consentManager.listPending(),
  }));

  app.post("/api/mobile/consent/:id/approve", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = deps.consentManager.approve(id, "click", "mobile.approve");
    if (!ok) {
      return reply.code(404).send({ error: "Consent request not found" });
    }
    return { ok: true };
  });

  app.post("/api/mobile/consent/:id/reject", async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = deps.consentManager.reject(id, "click", "mobile.reject");
    if (!ok) {
      return reply.code(404).send({ error: "Consent request not found" });
    }
    return { ok: true };
  });
}
