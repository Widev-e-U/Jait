import { describe, expect, it } from "vitest";
import { migrateDatabase, openDatabase } from "../db/index.js";
import { AuditWriter } from "./audit.js";

describe("AuditWriter persistence limits", () => {
  it("bounds large JSON fields while retaining action metadata", async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const audit = new AuditWriter(db);
      audit.write({
        actionId: "large-audit-action",
        actionType: "tool_call",
        toolName: "terminal.run",
        inputs: { command: "x".repeat(300_000) },
        outputs: { output: "y".repeat(300_000) },
        sideEffects: { changed: false },
        status: "executed",
      });

      const [entry] = audit.getAll();
      expect(entry?.actionId).toBe("large-audit-action");
      expect(Buffer.byteLength(entry?.inputs ?? "", "utf8")).toBeLessThanOrEqual(128_000);
      expect(Buffer.byteLength(entry?.outputs ?? "", "utf8")).toBeLessThanOrEqual(128_000);
      expect(JSON.parse(entry?.sideEffects ?? "{}")).toEqual({ changed: false });
    } finally {
      sqlite.close();
    }
  });
});
