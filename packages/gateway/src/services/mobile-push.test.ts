import { describe, expect, it, vi } from "vitest";
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

  it("pushes chat completion only to the chat owner's devices", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const send = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response("{}", { status: 200 }));
      const service = new MobilePushService(db, {
        project_id: "test", client_email: "test@example.com", private_key: "unused",
      }, send as typeof fetch);
      Object.assign(service, { accessToken: { value: "test-token", expiresAt: Date.now() + 3600_000 } });
      service.register("phone-a", "user-a", "token-a");
      service.register("phone-b", "user-b", "token-b");
      await service.sendChatCompleted("user-a", { id: "chat-complete:s:1", title: "Chat finished", body: "Done" });
      expect(send).toHaveBeenCalledTimes(1);
      expect(JSON.parse(send.mock.calls[0]![1]!.body as string)).toEqual({
        message: { token: "token-a", data: {
          type: "chat.completed", id: "chat-complete:s:1", title: "Chat finished", body: "Done",
        }, android: { priority: "high", ttl: "3600s" } },
      });
    } finally { sqlite.close(); }
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
