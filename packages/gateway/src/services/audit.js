/**
 * Audit log writer — records every tool call / action to SQLite.
 */
import { eq } from "drizzle-orm";
import { auditLog } from "../db/schema.js";
import { uuidv7 } from "../lib/uuidv7.js";
export class AuditWriter {
    db;
    constructor(db) {
        this.db = db;
    }
    /** Write a new audit log entry. Returns the entry's id. */
    write(entry) {
        const id = uuidv7();
        const now = new Date().toISOString();
        this.db.insert(auditLog).values({
            id,
            timestamp: now,
            sessionId: entry.sessionId ?? null,
            surfaceType: entry.surfaceType ?? null,
            deviceId: entry.deviceId ?? null,
            actionId: entry.actionId,
            actionType: entry.actionType,
            toolName: entry.toolName ?? null,
            inputs: entry.inputs ? JSON.stringify(entry.inputs) : null,
            outputs: entry.outputs ? JSON.stringify(entry.outputs) : null,
            sideEffects: entry.sideEffects ? JSON.stringify(entry.sideEffects) : null,
            signature: null,
            parentActionId: entry.parentActionId ?? null,
            status: entry.status,
            consentMethod: entry.consentMethod ?? null,
        }).run();
        return id;
    }
    /** Check if an action ID already exists (idempotency guard). */
    hasAction(actionId) {
        const row = this.db
            .select({ id: auditLog.id })
            .from(auditLog)
            .where(eq(auditLog.actionId, actionId))
            .get();
        return row !== undefined;
    }
    /** Get all audit entries for a session, newest first. */
    getBySession(sessionId) {
        return this.db
            .select()
            .from(auditLog)
            .where(eq(auditLog.sessionId, sessionId))
            .orderBy(auditLog.timestamp)
            .all();
    }
    /** Get all audit entries (newest first). */
    getAll() {
        return this.db.select().from(auditLog).orderBy(auditLog.timestamp).all();
    }
}
//# sourceMappingURL=audit.js.map