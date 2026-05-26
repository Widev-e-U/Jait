import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { messages } from "../db/schema.js";
import { SessionSearchService, buildFtsQuery } from "./session-search.js";
import { SessionService } from "./sessions.js";
import { ThreadService } from "./threads.js";

describe("SessionSearchService", () => {
  it("normalizes unsafe FTS input into a quoted token query", () => {
    expect(buildFtsQuery('rollback OR "drop" -table')).toBe('"rollback" OR "or" OR "drop" OR "table"');
    expect(buildFtsQuery("!")).toBeNull();
  });

  it("searches chat messages and thread activities with user scoping", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const sessionService = new SessionService(db);
      const threadService = new ThreadService(db);
      const search = new SessionSearchService(sqlite);
      const session = sessionService.create({ userId: "user-1", name: "Rollback planning" });
      const otherSession = sessionService.create({ userId: "user-2", name: "Private notes" });
      const now = new Date().toISOString();

      db.insert(messages).values([
        {
          id: "msg-user-1",
          sessionId: session.id,
          role: "user",
          content: "Please preserve the rollback sentinel in the migration plan.",
          createdAt: now,
        },
        {
          id: "msg-user-2",
          sessionId: otherSession.id,
          role: "user",
          content: "A private zephyr rollback note from another user.",
          createdAt: now,
        },
      ]).run();

      const thread = threadService.create({
        userId: "user-1",
        sessionId: session.id,
        title: "Migration thread",
        providerId: "jait",
      });
      threadService.addActivity(thread.id, "message", "Captured migration context", {
        content: "Thread activity mentions rollback sentinel coverage.",
      });

      const results = search.search({ query: "rollback sentinel", userId: "user-1", limit: 10 });

      expect(results).toEqual(expect.arrayContaining([
        expect.objectContaining({
          source: "message",
          id: "msg-user-1",
          sessionId: session.id,
          sessionName: "Rollback planning",
        }),
        expect.objectContaining({
          source: "thread_activity",
          threadId: thread.id,
          threadTitle: "Migration thread",
          kind: "message",
        }),
      ]));
      expect(results.some((result) => result.id === "msg-user-2")).toBe(false);

      const privateResults = search.search({ query: "private zephyr", userId: "user-1" });
      expect(privateResults).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it("respects source filters and updates the FTS index on message changes", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const sessionService = new SessionService(db);
      const search = new SessionSearchService(sqlite);
      const session = sessionService.create({ userId: "user-1", name: "Index updates" });

      db.insert(messages).values({
        id: "msg-update",
        sessionId: session.id,
        role: "assistant",
        content: "Initial phrase about compact summaries.",
        createdAt: new Date().toISOString(),
      }).run();

      expect(search.search({
        query: "compact summaries",
        userId: "user-1",
        includeThreadActivities: false,
      })).toHaveLength(1);

      db.update(messages)
        .set({ content: "Updated phrase about durable session search." })
        .where(eq(messages.id, "msg-update"))
        .run();

      expect(search.search({ query: "compact summaries", userId: "user-1" })).toEqual([]);
      const updated = search.search({ query: "durable session", userId: "user-1", includeThreadActivities: false });
      expect(updated).toEqual([
        expect.objectContaining({
          source: "message",
          id: "msg-update",
          sessionId: session.id,
        }),
      ]);

      db.delete(messages).where(eq(messages.id, "msg-update")).run();
      expect(search.search({ query: "durable session", userId: "user-1" })).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
});
