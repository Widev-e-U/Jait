import { expect, it } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { ThreadService } from "./threads.js";

it("persists and resets all diff counters without losing other metadata", async () => {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  const service = new ThreadService(db);
  const threadId = service.create({ title: "Persistence bounds", providerId: "codex" }).id;
  try {
    service.update(threadId, { changeFiles: 2, changeInsertions: 12, changeDeletions: 3 });
    expect(service.getById(threadId)).toMatchObject({ changeFiles: 2, changeInsertions: 12, changeDeletions: 3 });
    service.update(threadId, { changeFiles: 0, changeInsertions: 0, changeDeletions: 0 });
    expect(service.getById(threadId)).toMatchObject({ title: "Persistence bounds", changeFiles: 0, changeInsertions: 0, changeDeletions: 0 });
  } finally {
    sqlite.close();
  }
});
