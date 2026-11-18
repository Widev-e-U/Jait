import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { WsControlPlane } from "./ws.js";
import type { AppConfig } from "./config.js";
import { openDatabase, migrateDatabase } from "./db/index.js";

function makeConfig(): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: "test-jwt-secret-for-ws-tests",
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
  };
}

interface NotificationEvent {
  type: string;
  sessionId: string;
  timestamp: string;
  payload: { id: string; title: string; body: string; sessionId?: string };
}

describe("WsControlPlane.publishChatNotification", () => {
  let plane: WsControlPlane;
  let close: () => void;

  beforeEach(async () => {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    close = () => opened.sqlite.close();
    plane = new WsControlPlane(makeConfig(), opened.db);
  });

  afterEach(() => close());

  it("broadcasts a notification event that carries the session identity", () => {
    const broadcast = vi.spyOn(plane, "broadcastToUser").mockImplementation(() => {});
    plane.publishChatNotification("user-1", {
      id: "notif-1",
      title: "Finished",
      body: "Turn complete",
      sessionId: "sess-1",
    });

    expect(broadcast).toHaveBeenCalledTimes(1);
    const [userId, raw] = broadcast.mock.calls[0]!;
    const event = raw as unknown as NotificationEvent;
    expect(userId).toBe("user-1");
    expect(event.type).toBe("notification");
    expect(event.sessionId).toBe("sess-1");
    expect(event.payload).toMatchObject({ id: "notif-1", title: "Finished", body: "Turn complete" });
    expect(Number.isNaN(Date.parse(event.timestamp))).toBe(false);
  });

  it("drops notifications that are not tied to a session", () => {
    const broadcast = vi.spyOn(plane, "broadcastToUser").mockImplementation(() => {});
    plane.publishChatNotification("user-1", { id: "notif-2", title: "T", body: "B" });
    expect(broadcast).not.toHaveBeenCalled();
  });
});
