import { and, eq, isNull, lte, not, or } from "drizzle-orm";
import { schema } from "../db/index.js";
function toMemoryEntry(row) {
    return {
        id: row.id,
        scope: row.scope,
        content: row.content,
        source: {
            type: row.sourceType,
            id: row.sourceId,
            surface: row.sourceSurface,
        },
        embedding: JSON.parse(row.embedding),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        expiresAt: row.expiresAt ?? undefined,
    };
}
export class SqliteMemoryBackend {
    db;
    constructor(db) {
        this.db = db;
    }
    async save(entry) {
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
    async list(scope) {
        const nowIso = new Date().toISOString();
        const rows = await this.db
            .select()
            .from(schema.memories)
            .where(and(scope ? eq(schema.memories.scope, scope) : undefined, or(isNull(schema.memories.expiresAt), not(lte(schema.memories.expiresAt, nowIso)))))
            .orderBy(schema.memories.createdAt);
        return rows.map(toMemoryEntry);
    }
    async forget(id) {
        const existing = await this.db.select({ id: schema.memories.id }).from(schema.memories).where(eq(schema.memories.id, id));
        if (existing.length === 0)
            return false;
        await this.db.delete(schema.memories).where(eq(schema.memories.id, id));
        return true;
    }
    async forgetExpired(now = new Date()) {
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
//# sourceMappingURL=sqlite-backend.js.map