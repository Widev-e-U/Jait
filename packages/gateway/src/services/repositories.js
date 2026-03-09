/**
 * RepositoryService — CRUD for automation repositories.
 *
 * Persists repos in SQLite so they sync across all devices.
 */
import { eq, desc } from "drizzle-orm";
import { automationRepositories } from "../db/schema.js";
import { uuidv7 } from "../lib/uuidv7.js";
// ── Service ──────────────────────────────────────────────────────────
export class RepositoryService {
    db;
    constructor(db) {
        this.db = db;
    }
    create(params) {
        const id = uuidv7();
        const now = new Date().toISOString();
        this.db
            .insert(automationRepositories)
            .values({
            id,
            userId: params.userId ?? null,
            deviceId: params.deviceId ?? null,
            name: params.name,
            defaultBranch: params.defaultBranch ?? "main",
            localPath: params.localPath,
            createdAt: now,
            updatedAt: now,
        })
            .run();
        return this.getById(id);
    }
    getById(id) {
        return this.db
            .select()
            .from(automationRepositories)
            .where(eq(automationRepositories.id, id))
            .get();
    }
    list(userId) {
        const base = this.db.select().from(automationRepositories);
        if (userId) {
            return base
                .where(eq(automationRepositories.userId, userId))
                .orderBy(desc(automationRepositories.updatedAt))
                .all();
        }
        return base.orderBy(desc(automationRepositories.updatedAt)).all();
    }
    findByPath(localPath, userId) {
        const all = this.list(userId);
        return all.find((r) => r.localPath === localPath);
    }
    update(id, params) {
        const now = new Date().toISOString();
        this.db
            .update(automationRepositories)
            .set({ ...params, updatedAt: now })
            .where(eq(automationRepositories.id, id))
            .run();
        return this.getById(id);
    }
    delete(id) {
        this.db
            .delete(automationRepositories)
            .where(eq(automationRepositories.id, id))
            .run();
    }
}
//# sourceMappingURL=repositories.js.map