import { and, eq, isNull, lte, not, or } from "drizzle-orm";
import type { JaitDB } from "../db/index.js";
import { schema } from "../db/index.js";
import type { MemoryBackend, MemoryEntry, MemoryScope } from "./contracts.js";

function toMemoryEntry(row: typeof schema.memories.$inferSelect): MemoryEntry {
  return {
    id: row.id,
    scope: row.scope as MemoryScope,
    content: row.content,
    source: {
      type: row.sourceType,
      id: row.sourceId,
      surface: row.sourceSurface,
    },
    embedding: JSON.parse(row.embedding) as Record<string, number>,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    expiresAt: row.expiresAt ?? undefined,
  };
}

export class SqliteMemoryBackend implements MemoryBackend {
  constructor(private readonly db: JaitDB) {}

  async save(entry: MemoryEntry): Promise<void> {
    await this.db.insert(schema.memories).values({
      id: entry.id,
      scope: entry.scope,
      content: entry.content,
      sourceType: entry.source.type,
      sourceId: entry.source.id,
      sourceSurface: entry.source.surface,
      embedding: JSON.stringify(entry.embedding),
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      expiresAt: entry.expiresAt ?? null,
    });
  }

  async list(scope?: MemoryScope): Promise<MemoryEntry[]> {
    const nowIso = new Date().toISOString();
    const rows = await this.db
      .select()
      .from(schema.memories)
      .where(
        and(
          scope ? eq(schema.memories.scope, scope) : undefined,
          or(isNull(schema.memories.expiresAt), not(lte(schema.memories.expiresAt, nowIso))),
        ),
      )
      .orderBy(schema.memories.createdAt);

    return rows.map(toMemoryEntry);
  }

  async forget(id: string): Promise<boolean> {
    const existing = await this.db.select({ id: schema.memories.id }).from(schema.memories).where(eq(schema.memories.id, id));
    if (existing.length === 0) return false;
    await this.db.delete(schema.memories).where(eq(schema.memories.id, id));
    return true;
  }

  async forgetExpired(now = new Date()): Promise<number> {
    const nowIso = now.toISOString();
    const expired = await this.db
      .select({ id: schema.memories.id })
      .from(schema.memories)
      .where(and(not(isNull(schema.memories.expiresAt)), lte(schema.memories.expiresAt, nowIso)));

    if (expired.length > 0) {
      await this.db
        .delete(schema.memories)
        .where(and(not(isNull(schema.memories.expiresAt)), lte(schema.memories.expiresAt, nowIso)));
    }

    return expired.length;
  }
}
