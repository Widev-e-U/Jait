import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { openDatabase, migrateDatabase } from "../db/index.js";
import { messages } from "../db/schema.js";
import { notifySessionsOfGatewayRestart, __chatTestUtils } from "./chat.js";

describe("notifySessionsOfGatewayRestart", () => {
  afterEach(() => {
    __chatTestUtils.activeStreams.clear();
    __chatTestUtils.activeCliTurns.clear();
  });

  it("is a no-op when no session work is active", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const count = notifySessionsOfGatewayRestart(db, {
      oldVersion: "0.1.781",
      newVersion: "0.1.782",
    });

    expect(count).toBe(0);
    expect(db.select().from(messages).all()).toHaveLength(0);
  });

  it("persists a durable system notice into every session with live work", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    __chatTestUtils.activeStreams.add("stream-session");
    __chatTestUtils.activeCliTurns.add("cli-session");
    __chatTestUtils.activeCliTurns.add("stream-session"); // overlap → deduped

    const count = notifySessionsOfGatewayRestart(db, {
      oldVersion: "0.1.781",
      newVersion: "0.1.782",
    });

    expect(count).toBe(2);
    const notices = db
      .select()
      .from(messages)
      .where(eq(messages.role, "system"))
      .orderBy(messages.sessionId)
      .all();
    expect(notices).toHaveLength(2);
    for (const notice of notices) {
      expect(notice.content).toContain("Gateway restarted by a self-update (0.1.781 → 0.1.782)");
      expect(notice.content).toContain("may be partial");
    }
    expect(notices.map((n) => n.sessionId).sort()).toEqual(["cli-session", "stream-session"]);
  });

  it("omits version detail when only one version is known", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    __chatTestUtils.activeStreams.add("s1");

    expect(notifySessionsOfGatewayRestart(db)).toBe(1);
    const notice = db.select().from(messages).where(eq(messages.sessionId, "s1")).get();
    expect(notice?.content).toContain("self-update while");
    expect(notice?.content).not.toContain("→");
  });
});