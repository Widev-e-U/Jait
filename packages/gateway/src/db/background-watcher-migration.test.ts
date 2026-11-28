import { expect, it } from "vitest";
import { migrateDatabase, openDatabase } from "./connection.js";
import { SessionService } from "../services/sessions.js";

it("archives only legacy terminal forks with a completion receipt in their parent chat", async () => {
  const { db, sqlite } = await openDatabase(":memory:");
  try {
    migrateDatabase(sqlite);
    sqlite.exec("DELETE FROM _migrations WHERE id = 83");
    const sessions = new SessionService(db);
    const parent = sessions.create({ name: "Main loop" });
    const createBranch = (kind: string) => sessions.create({
      name: "Background terminal · Main loop",
      metadata: { branch: { kind, parentSessionId: parent.id } },
    });
    const completed = createBranch("background-command");
    const unresolved = createBranch("background-command");
    const manual = createBranch("manual");
    const insertReceipt = sqlite.prepare(`INSERT INTO messages (id, session_id, role, content, created_at)
      VALUES (?, ?, 'system', ?, ?)`);
    for (const [chatId, watcherId] of [[parent.id, completed.id], [parent.id, manual.id], [manual.id, unresolved.id]]) {
      insertReceipt.run(watcherId!, chatId!, `Background terminal result · Command finished (exit 0) · chat ${watcherId}.`, completed.createdAt);
    }

    migrateDatabase(sqlite);

    expect(sessions.getById(completed.id)?.status).toBe("archived");
    expect(sessions.getById(unresolved.id)?.status).toBe("active");
    expect(sessions.getById(manual.id)?.status).toBe("active");
    expect(sessions.getById(parent.id)?.status).toBe("active");
  } finally {
    sqlite.close();
  }
});
