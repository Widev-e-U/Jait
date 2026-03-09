/**
 * Session state service — per-session key-value store for UI and app state.
 *
 * Each entry is (session_id, key) → JSON value.
 * Keys are namespaced strings like "workspace.panel", "terminal.visible", etc.
 */
import { and, eq, inArray } from "drizzle-orm";
import { sessionState } from "../db/schema.js";
export class SessionStateService {
    db;
    constructor(db) {
        this.db = db;
    }
    /**
     * Get state values for a session.
     * @param sessionId  The session to read from.
     * @param keys       Optional list of keys to filter. Omit for all keys.
     * @returns          Record mapping key → parsed JSON value (or null).
     */
    get(sessionId, keys) {
        const rows = keys?.length
            ? this.db
                .select()
                .from(sessionState)
                .where(and(eq(sessionState.sessionId, sessionId), inArray(sessionState.key, keys)))
                .all()
            : this.db
                .select()
                .from(sessionState)
                .where(eq(sessionState.sessionId, sessionId))
                .all();
        const result = {};
        for (const row of rows) {
            try {
                result[row.key] = row.value ? JSON.parse(row.value) : null;
            }
            catch {
                result[row.key] = row.value;
            }
        }
        return result;
    }
    /**
     * Upsert one or more state entries for a session.
     * Send `null` as a value to delete that key.
     */
    set(sessionId, entries) {
        const now = new Date().toISOString();
        for (const [key, value] of Object.entries(entries)) {
            if (value === null || value === undefined) {
                // Delete the key
                this.db
                    .delete(sessionState)
                    .where(and(eq(sessionState.sessionId, sessionId), eq(sessionState.key, key)))
                    .run();
            }
            else {
                // Upsert — try insert, on conflict update
                const serialized = JSON.stringify(value);
                const existing = this.db
                    .select()
                    .from(sessionState)
                    .where(and(eq(sessionState.sessionId, sessionId), eq(sessionState.key, key)))
                    .get();
                if (existing) {
                    this.db
                        .update(sessionState)
                        .set({ value: serialized, updatedAt: now })
                        .where(and(eq(sessionState.sessionId, sessionId), eq(sessionState.key, key)))
                        .run();
                }
                else {
                    this.db
                        .insert(sessionState)
                        .values({ sessionId, key, value: serialized, updatedAt: now })
                        .run();
                }
            }
        }
    }
    /** Delete all state for a session (e.g. on session delete). */
    deleteAll(sessionId) {
        this.db
            .delete(sessionState)
            .where(eq(sessionState.sessionId, sessionId))
            .run();
    }
}
//# sourceMappingURL=session-state.js.map