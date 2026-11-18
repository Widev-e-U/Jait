import { describe, expect, it } from "vitest";
import { ChatNotificationsService } from "./chat-notifications.js";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { SessionStateService } from "./session-state.js";
import { SessionService } from "./sessions.js";

describe("completion notification persistence", () => {
  it("retains exact read identity across service recreation and isolates users", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const sessions = new SessionService(db);
      const session = sessions.create({ name: "Chat" });
      const first = { id: "reply-1", sessionId: session.id, replaceId: `chat-complete:${session.id}`, read: false };
      const service = new ChatNotificationsService(db);
      service.set("owner", first);
      expect(new ChatNotificationsService(db).list("owner")).toEqual([first]);
      expect(new ChatNotificationsService(db).list("other")).toEqual([]);
      service.set("owner", { ...first, read: true });
      expect(new ChatNotificationsService(db).get(session.id)?.state.read).toBe(true);
      const next = { ...first, id: "reply-2" };
      service.set("owner", next);
      expect(new ChatNotificationsService(db).get(session.id)?.state).toEqual(next);
      new SessionStateService(db).set(session.id, { "notification.completion": {
        userId: "owner", state: { ...first, replaceId: "question:unrelated" },
      } });
      expect(service.get(session.id)).toBeNull();
      expect(service.list("owner")).toEqual([]);
    } finally { sqlite.close(); }
  });
});
