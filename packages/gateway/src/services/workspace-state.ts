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

    // Auto-migrate: if legacy fragmented keys exist but workspace.ui doesn't,
    // merge them into the unified key and delete the old rows.
    const shouldMigrate = !result['workspace.ui'] && (!keys || keys.includes('workspace.ui'));
    if (shouldMigrate) {
      // Fetch all rows to check for legacy keys (if we only fetched specific keys above)
      const allRows = keys?.length
        ? this.db.select().from(workspaceState).where(eq(workspaceState.workspaceId, workspaceId)).all()
        : rows;
      const allResult: Record<string, unknown> = {};
      for (const row of allRows) {
        try { allResult[row.key] = row.value ? JSON.parse(row.value) : null; }
        catch { allResult[row.key] = row.value; }
      }

      const legacyKeys = ['workspace.panel', 'workspace.tabs', 'workspace.layout', 'workspace.layout.mobile', 'terminal.panel', 'dev-preview.panel'];
      const hasLegacy = legacyKeys.some(k => k in allResult);
      if (hasLegacy) {
        const ui = {
          panel: (allResult['workspace.panel'] as Record<string, unknown> | null) ?? null,
          tabs: (allResult['workspace.tabs'] as Record<string, unknown> | null) ?? null,
          layout: (allResult['workspace.layout'] as Record<string, unknown> | null) ?? (allResult['workspace.layout.mobile'] as Record<string, unknown> | null) ?? null,
          terminal: (allResult['terminal.panel'] as Record<string, unknown> | null) ?? null,
          preview: (allResult['dev-preview.panel'] as Record<string, unknown> | null) ?? null,
        };
        this.set(workspaceId, { 'workspace.ui': ui });
        for (const k of legacyKeys) {
          if (k in allResult) {
            this.db.delete(workspaceState).where(and(eq(workspaceState.workspaceId, workspaceId), eq(workspaceState.key, k))).run();
          }
        }
        result['workspace.ui'] = ui;
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
