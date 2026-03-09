import type { JaitDB } from "../db/connection.js";
export declare class SessionStateService {
    private db;
    constructor(db: JaitDB);
    /**
     * Get state values for a session.
     * @param sessionId  The session to read from.
     * @param keys       Optional list of keys to filter. Omit for all keys.
     * @returns          Record mapping key → parsed JSON value (or null).
     */
    get(sessionId: string, keys?: string[]): Record<string, unknown>;
    /**
     * Upsert one or more state entries for a session.
     * Send `null` as a value to delete that key.
     */
    set(sessionId: string, entries: Record<string, unknown>): void;
    /** Delete all state for a session (e.g. on session delete). */
    deleteAll(sessionId: string): void;
}
//# sourceMappingURL=session-state.d.ts.map