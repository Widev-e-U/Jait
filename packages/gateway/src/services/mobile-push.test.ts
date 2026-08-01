import { describe, expect, it } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { MobilePushService, shouldDeliverQuestionPush } from "./mobile-push.js";

describe("MobilePushService", () => {
  it("delivers every question regardless of attention", () => {
    expect(shouldDeliverQuestionPush({ userId: "user-a", attention: "normal" })).toBe(true);
    expect(shouldDeliverQuestionPush({ userId: "user-a", attention: "urgent" })).toBe(true);
    expect(shouldDeliverQuestionPush({ userId: null, attention: "normal" })).toBe(false);
  });

  it("persists registrations across service instances", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    new MobilePushService(db, null).register("android-primary", "user-a", "token-a");
    expect(new MobilePushService(db, null).list("user-a")).toEqual([
      { deviceId: "android-primary", userId: "user-a", token: "token-a" },
    ]);
    sqlite.close();
  });

  it("rotates tokens and isolates user revocation", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const service = new MobilePushService(db, null);
    service.register("android-primary", "user-a", "old-token");
    service.register("android-primary", "user-a", "new-token");
    service.register("android-secondary", "user-b", "other-token");
    expect(service.list("user-a")).toEqual([
      { deviceId: "android-primary", userId: "user-a", token: "new-token" },
    ]);
    expect(service.unregister("android-primary", "user-b")).toBe(false);
    expect(service.unregister("android-primary", "user-a")).toBe(true);
    expect(service.list("user-a")).toEqual([]);
    expect(service.list("user-b")).toHaveLength(1);
    sqlite.close();
  });
});
