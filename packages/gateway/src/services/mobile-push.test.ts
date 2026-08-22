import { describe, expect, it } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { attentionRevokeTargets, MobilePushService } from "./mobile-push.js";

const registrations = [
  { deviceId: "phone", userId: "user-a", token: "token-phone" },
  { deviceId: "watch", userId: "user-a", token: "token-watch" },
];

describe("MobilePushService", () => {
  it("revokes on every device except the one that answered", () => {
    expect(attentionRevokeTargets(registrations, "watch")).toEqual([registrations[0]]);
  });

  it("revokes everywhere when the resolving device is unknown", () => {
    expect(attentionRevokeTargets(registrations, null)).toEqual(registrations);
    expect(attentionRevokeTargets(registrations, "desktop-electron")).toEqual(registrations);
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
