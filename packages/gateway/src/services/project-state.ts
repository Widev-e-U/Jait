import { and, eq, inArray } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { projectState } from "../db/schema.js";

export class ProjectStateService {
  constructor(private db: JaitDB) {}

  get(projectId: string, keys?: string[]): Record<string, unknown> {
    const rows = keys?.length
      ? this.db
          .select()
          .from(projectState)
          .where(and(eq(projectState.projectId, projectId), inArray(projectState.key, keys)))
          .all()
      : this.db
          .select()
          .from(projectState)
          .where(eq(projectState.projectId, projectId))
          .all();

    const result: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        result[row.key] = row.value ? JSON.parse(row.value) : null;
      } catch {
        result[row.key] = row.value;
      }
    }

    // Auto-migrate: if legacy fragmented keys exist but project.ui doesn't,
    // merge them into the unified key and delete the old rows.
    const shouldMigrate = !result['project.ui'] && (!keys || keys.includes('project.ui'));
    if (shouldMigrate) {
      // Fetch all rows to check for legacy keys (if we only fetched specific keys above)
      const allRows = keys?.length
        ? this.db.select().from(projectState).where(eq(projectState.projectId, projectId)).all()
        : rows;
      const allResult: Record<string, unknown> = {};
      for (const row of allRows) {
        try { allResult[row.key] = row.value ? JSON.parse(row.value) : null; }
        catch { allResult[row.key] = row.value; }
      }

      const legacyKeys = ['project.panel', 'project.tabs', 'project.layout', 'project.layout.mobile', 'terminal.panel', 'dev-preview.panel'];
      const hasLegacy = legacyKeys.some(k => k in allResult);
      if (hasLegacy) {
        const ui = {
          panel: (allResult['project.panel'] as Record<string, unknown> | null) ?? null,
          tabs: (allResult['project.tabs'] as Record<string, unknown> | null) ?? null,
          layout: (allResult['project.layout'] as Record<string, unknown> | null) ?? (allResult['project.layout.mobile'] as Record<string, unknown> | null) ?? null,
          terminal: (allResult['terminal.panel'] as Record<string, unknown> | null) ?? null,
          preview: (allResult['dev-preview.panel'] as Record<string, unknown> | null) ?? null,
        };
        this.set(projectId, { 'project.ui': ui });
        for (const k of legacyKeys) {
          if (k in allResult) {
            this.db.delete(projectState).where(and(eq(projectState.projectId, projectId), eq(projectState.key, k))).run();
          }
        }
        result['project.ui'] = ui;
      }
    }

    return result;
  }

  set(projectId: string, entries: Record<string, unknown>) {
    const now = new Date().toISOString();
    for (const [key, value] of Object.entries(entries)) {
      if (value === null || value === undefined) {
        this.db.delete(projectState).where(and(eq(projectState.projectId, projectId), eq(projectState.key, key))).run();
        continue;
      }

      const serialized = JSON.stringify(value);
      const existing = this.db
        .select()
        .from(projectState)
        .where(and(eq(projectState.projectId, projectId), eq(projectState.key, key)))
        .get();

      if (existing) {
        this.db
          .update(projectState)
          .set({ value: serialized, updatedAt: now })
          .where(and(eq(projectState.projectId, projectId), eq(projectState.key, key)))
          .run();
      } else {
        this.db.insert(projectState).values({ projectId, key, value: serialized, updatedAt: now }).run();
      }
    }
  }
}
