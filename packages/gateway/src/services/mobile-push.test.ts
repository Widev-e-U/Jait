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
    expect(attentionRevokeTargets(registrations, "desktop-desktop")).toEqual(registrations);
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
      await service.sendChatCompleted("user-a", { id: "chat-complete:s:1", title: "Chat finished", body: "Done", replaceId: "chat-complete:s", sessionId: "s", link: "/chat?sessionId=s&projectId=p" });
      expect(send).toHaveBeenCalledTimes(1);
      expect(JSON.parse(send.mock.calls[0]![1]!.body as string)).toEqual({
        message: { token: "token-a", data: {
          type: "chat.completed", id: "chat-complete:s:1", title: "Chat finished", body: "Done", replaceId: "chat-complete:s", sessionId: "s", link: "/chat?sessionId=s&projectId=p",
        }, android: { priority: "high", ttl: "3600s" } },
      });
    } finally { sqlite.close(); }
  });

  it("sends only a gateway image reference, never attachment contents or encryption keys", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const send = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response("{}", { status: 200 }));
      const service = new MobilePushService(db, { project_id: "test", client_email: "test@example.com", private_key: "unused" }, send as typeof fetch);
      Object.assign(service, { accessToken: { value: "test-token", expiresAt: Date.now() + 3600_000 } });
      service.register("phone", "user-a", "token-a");
      await service.sendMessengerMessage("user-a", { roomId: "!room:test", eventId: "$photo", title: "Bob", body: "Photo", timestamp: 1234, image: true });
      const data = JSON.parse(send.mock.calls[0]![1]!.body as string).message.data;
      expect(data).toMatchObject({ id: "matrix-message:$photo", replaceId: "matrix-room:!room:test", roomId: "!room:test", eventId: "$photo", imageAvailable: "true", timestamp: "1234" });
      expect(JSON.stringify(data)).not.toContain("secret");
      expect(JSON.stringify(data)).not.toContain("mxc://");
    } finally { sqlite.close(); }
  });

  it("clears the exact completion on only the owner's devices, even if one push fails", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const send = vi.fn(async (_url: unknown, init?: RequestInit) => {
        const token = JSON.parse(init!.body as string).message.token;
        return new Response("{}", { status: token === "bad-token" ? 503 : 200 });
      });
      const service = new MobilePushService(db, {
        project_id: "test", client_email: "test@example.com", private_key: "unused",
      }, send as typeof fetch);
      Object.assign(service, { accessToken: { value: "test-token", expiresAt: Date.now() + 3600_000 } });
      service.register("stale", "user-a", "bad-token");
      service.register("phone-a", "user-a", "token-a");
      service.register("phone-b", "user-b", "token-b");
      await service.sendChatNotificationRead("user-a", {
        id: "completion-1", sessionId: "s", replaceId: "chat-complete:s", read: true,
      });
      const messages = send.mock.calls.map((call) => JSON.parse(call[1]!.body as string).message);
      expect(messages).toHaveLength(2);
      expect(messages.map((message) => message.token).sort()).toEqual(["bad-token", "token-a"]);
      expect(messages.find((message) => message.token === "token-a")).toEqual({ token: "token-a", data: {
        type: "chat.notification-read", id: "completion-1", sessionId: "s", replaceId: "chat-complete:s",
      }, android: { priority: "high", ttl: "3600s" } });
      expect(warn).toHaveBeenCalledOnce();
    } finally { warn.mockRestore(); sqlite.close(); }
  });

  it("sends questions without an expiry or push TTL override", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const send = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response("{}", { status: 200 }));
      const service = new MobilePushService(db, {
        project_id: "test", client_email: "test@example.com", private_key: "unused",
      }, send as typeof fetch);
      Object.assign(service, { accessToken: { value: "test-token", expiresAt: Date.now() + 3600_000 } });
      service.register("phone", "user-a", "token-phone");
      await service.sendAttention({ key: "question:q1", kind: "question", requestId: "q1", sessionId: "s1",
        userId: "user-a", title: "Question", body: "Choose", urgent: false, actions: [], link: "/",
        createdAt: new Date().toISOString(), expiresAt: null });
      const body = JSON.parse(send.mock.calls[0]![1]!.body as string);
      expect(body.message.android).toEqual({ priority: "high" });
      expect(JSON.parse(body.message.data.item).expiresAt).toBeNull();
    } finally { sqlite.close(); }
  });

  it("carries flat agent identity into the FCM data map, and omits it when absent", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const send = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response("{}", { status: 200 }));
      const service = new MobilePushService(db, {
        project_id: "test", client_email: "test@example.com", private_key: "unused",
      }, send as typeof fetch);
      Object.assign(service, { accessToken: { value: "test-token", expiresAt: Date.now() + 3600_000 } });
      service.register("phone-a", "user-a", "token-a");

      await service.sendChatCompleted("user-a", {
        id: "chat-complete:s:1", title: "Lady Merge-a-Lot · Chat finished", body: "Junior Software Engineer · Done",
        replaceId: "chat-complete:s", sessionId: "s", link: "/chat?sessionId=s&projectId=p",
        agentId: "01a1117a-495f-7dde-a504-7643383195f8", agentName: "Lady Merge-a-Lot",
        agentRole: "Junior Software Engineer", agentAvatar: "Orbit",
      });
      // FCM data values are strings only, so identity must survive as flat strings.
      expect(JSON.parse(send.mock.calls[0]![1]!.body as string).message.data).toEqual({
        type: "chat.completed", id: "chat-complete:s:1", title: "Lady Merge-a-Lot · Chat finished",
        body: "Junior Software Engineer · Done", replaceId: "chat-complete:s", sessionId: "s",
        link: "/chat?sessionId=s&projectId=p",
        agentId: "01a1117a-495f-7dde-a504-7643383195f8", agentName: "Lady Merge-a-Lot",
        agentRole: "Junior Software Engineer", agentAvatar: "Orbit",
      });

      await service.sendChatCompleted("user-a", {
        id: "chat-complete:s:2", title: "Chat finished", body: "Done", sessionId: "s",
      });
      const absent = JSON.parse(send.mock.calls[1]![1]!.body as string).message.data;
      expect(Object.keys(absent).filter((key) => key.startsWith("agent"))).toEqual([]);
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
