import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config.js";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { SchedulerService } from "../scheduler/service.js";
import { ConsentManager } from "../security/consent-manager.js";
import { signAuthToken } from "../security/http-auth.js";
import { DeviceRegistry } from "../services/device-registry.js";
import { MobilePushService } from "../services/mobile-push.js";
import { registerMobileRoutes } from "./mobile.js";

describe("mobile routes", () => {
  it("persists authenticated push devices and upserts local-time routines", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const scheduler = new SchedulerService({ db, executeTool: vi.fn(async () => ({ ok: true, message: "done" })) });
    const mobilePush = new MobilePushService(db, null);
    const config = { ...loadConfig(), jwtSecret: "mobile-route-secret" };
    const app = Fastify();
    registerMobileRoutes(app, {
      deviceRegistry: new DeviceRegistry(), consentManager: new ConsentManager({ db }),
      config, scheduler, mobilePush,
    });
    const token = await signAuthToken({ id: "user-mobile", username: "mobile-user" }, config.jwtSecret);
    const headers = { authorization: "Bearer " + token };

    const registration = await app.inject({ method: "POST", url: "/api/mobile/devices/register", headers, payload: {
      id: "android-primary", name: "Daily phone", platform: "mobile", capabilities: ["notifications"], pushToken: "push-token",
    } });
    expect(registration.statusCode).toBe(200);
    expect(mobilePush.list("user-mobile")).toHaveLength(1);

    const first = await app.inject({ method: "PUT", url: "/api/mobile/routines/morning", headers, payload: {
      time: "07:15", timeZone: "Europe/Berlin",
    } });
    expect(first.statusCode).toBe(200);
    const firstId = first.json().routine.id as string;
    expect(first.json().routine.cron).toBe("15 07 * * *");

    const updated = await app.inject({ method: "PUT", url: "/api/mobile/routines/morning", headers, payload: {
      time: "08:00", timeZone: "Europe/Berlin",
    } });
    expect(updated.json().routine.id).toBe(firstId);
    expect(updated.json().routine.cron).toBe("00 08 * * *");
    expect(scheduler.list("user-mobile")).toHaveLength(1);

    await app.close();
    sqlite.close();
  });

  it("rejects invalid routine times and timezones", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const config = { ...loadConfig(), jwtSecret: "mobile-route-secret" };
    const app = Fastify();
    registerMobileRoutes(app, {
      deviceRegistry: new DeviceRegistry(), consentManager: new ConsentManager({ db }), config,
      scheduler: new SchedulerService({ db, executeTool: vi.fn(async () => ({ ok: true, message: "done" })) }),
    });
    const token = await signAuthToken({ id: "user-mobile", username: "mobile-user" }, config.jwtSecret);
    const headers = { authorization: "Bearer " + token };
    expect((await app.inject({ method: "PUT", url: "/api/mobile/routines/morning", headers, payload: { time: "25:00" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "PUT", url: "/api/mobile/routines/morning", headers, payload: { timeZone: "Mars/Olympus" } })).statusCode).toBe(400);
    await app.close();
    sqlite.close();
  });
});
