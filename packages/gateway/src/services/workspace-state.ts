import { and, eq, inArray } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { workspaceState } from "../db/schema.js";

export class WorkspaceStateService {
  constructor(private db: JaitDB) {}

  get(workspaceId: string, keys?: string[]): Record<string, unknown> {
    const rows = keys?.length
      ? this.db
          .select()
          .from(workspaceState)
          .where(and(eq(workspaceState.workspaceId, workspaceId), inArray(workspaceState.key, keys)))
          .all()
      : this.db
          .select()
          .from(workspaceState)
          .where(eq(workspaceState.workspaceId, workspaceId))
          .all();

    const result: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        result[row.key] = row.value ? JSON.parse(row.value) : null;
      } catch {
        result[row.key] = row.value;
      }
    }
    return result;
  }

  set(workspaceId: string, entries: Record<string, unknown>) {
    const now = new Date().toISOString();
    for (const [key, value] of Object.entries(entries)) {
      if (value === null || value === undefined) {
        this.db.delete(workspaceState).where(and(eq(workspaceState.workspaceId, workspaceId), eq(workspaceState.key, key))).run();
        continue;
      }

      const serialized = JSON.stringify(value);
      const existing = this.db
        .select()
        .from(workspaceState)
        .where(and(eq(workspaceState.workspaceId, workspaceId), eq(workspaceState.key, key)))
        .get();

      if (existing) {
        this.db
          .update(workspaceState)
          .set({ value: serialized, updatedAt: now })
          .where(and(eq(workspaceState.workspaceId, workspaceId), eq(workspaceState.key, key)))
          .run();
      } else {
        this.db.insert(workspaceState).values({ workspaceId, key, value: serialized, updatedAt: now }).run();
      }
    }
  }
}
