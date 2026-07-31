import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config.js";
import { requireAuth } from "../security/http-auth.js";
import type { SchedulerService } from "../scheduler/service.js";
import type { ConsentManager } from "../security/consent-manager.js";
import type { DeviceRegistry } from "../services/device-registry.js";
import type { MobilePushService } from "../services/mobile-push.js";
import type { SessionService } from "../services/sessions.js";

interface MobileRouteDeps {
  deviceRegistry: DeviceRegistry;
  consentManager: ConsentManager;
  sessionService?: SessionService;
  config: AppConfig;
  mobilePush?: MobilePushService;
  scheduler?: SchedulerService;
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
    const pushToken = String(body["pushToken"] ?? "").trim();

    if (!id || !name || (platform !== "mobile" && platform !== "desktop" && platform !== "browser")) {
      return reply.code(400).send({ error: "Invalid device registration payload" });
    }

    const device = deps.deviceRegistry.register({
      id,
      name,
      platform,
      capabilities,
    });
    if (pushToken) {
      const authUser = await requireAuth(request, reply, deps.config.jwtSecret);
      if (!authUser) return;
      deps.mobilePush?.register(id, authUser.id, pushToken);
    }
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

  app.get("/api/mobile/push-devices", async (request, reply) => {
    const authUser = await requireAuth(request, reply, deps.config.jwtSecret);
    if (!authUser) return;
    return { devices: deps.mobilePush?.list(authUser.id).map(({ deviceId }) => ({ deviceId })) ?? [] };
  });

  app.delete("/api/mobile/push-devices/:deviceId", async (request, reply) => {
    const authUser = await requireAuth(request, reply, deps.config.jwtSecret);
    if (!authUser) return;
    const { deviceId } = request.params as { deviceId: string };
    if (!deps.mobilePush?.unregister(deviceId, authUser.id)) {
      return reply.code(404).send({ error: "Push device not found" });
    }
    return { ok: true };
  });

  app.get("/api/mobile/routines", async (request, reply) => {
    const authUser = await requireAuth(request, reply, deps.config.jwtSecret);
    if (!authUser) return;
    const routines = (deps.scheduler?.list(authUser.id) ?? []).filter((job) => {
      const input = job.input && typeof job.input === "object" ? job.input as Record<string, unknown> : {};
      const meta = input["__jaitJobMeta"] && typeof input["__jaitJobMeta"] === "object" ? input["__jaitJobMeta"] as Record<string, unknown> : {};
      return meta["routineKind"] === "morning" || meta["routineKind"] === "evening";
    });
    return { routines };
  });

  app.put("/api/mobile/routines/:kind", async (request, reply) => {
    const authUser = await requireAuth(request, reply, deps.config.jwtSecret);
    if (!authUser) return;
    if (!deps.scheduler) return reply.code(503).send({ error: "Scheduler unavailable" });
    const { kind } = request.params as { kind: string };
    if (kind !== "morning" && kind !== "evening") return reply.code(400).send({ error: "Invalid routine kind" });
    const body = (request.body ?? {}) as Record<string, unknown>;
    const time = typeof body["time"] === "string" ? body["time"] : kind === "morning" ? "07:00" : "21:00";
    const match = /^(\d{2}):(\d{2})$/.exec(time);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return reply.code(400).send({ error: "time must be HH:mm" });
    const timeZone = typeof body["timeZone"] === "string" ? body["timeZone"] : "UTC";
    try { new Intl.DateTimeFormat("en-US", { timeZone }).format(); } catch { return reply.code(400).send({ error: "Invalid timeZone" }); }
    const prompt = typeof body["prompt"] === "string" && body["prompt"].trim()
      ? body["prompt"].trim()
      : kind === "morning"
        ? "Prepare my morning briefing from my calendar, reminders, and relevant memories. Tell me what is planned today, then ask one concise question if something needs clarification."
        : "Run my evening check-in. Summarize unfinished items and tomorrow, ask what I want to remember, and offer to schedule a wake-up alarm.";
    const input = {
      action: "create", kind: "delivery", prompt, workingDirectory: process.cwd(), start: true, detach: true,
      __jaitJobMeta: { jobType: "agent_task", routineKind: kind, timeZone, prompt, description: kind + " daily routine" },
    };
    const existing = deps.scheduler.list(authUser.id).find((job) => {
      const value = job.input && typeof job.input === "object" ? job.input as Record<string, unknown> : {};
      const meta = value["__jaitJobMeta"] && typeof value["__jaitJobMeta"] === "object" ? value["__jaitJobMeta"] as Record<string, unknown> : {};
      return meta["routineKind"] === kind && job.userId === authUser.id;
    });
    const patch = { name: "Daily " + kind + " routine", cron: match[2] + " " + match[1] + " * * *", toolName: "thread.control", input, enabled: body["enabled"] !== false };
    const routine = existing ? deps.scheduler.update(existing.id, patch, authUser.id) : deps.scheduler.create({ userId: authUser.id, ...patch, sessionId: "default", projectRoot: process.cwd() });
    return { routine };
  });

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
