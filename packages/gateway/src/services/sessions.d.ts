import type { JaitDB } from "../db/connection.js";
export interface CreateSessionParams {
    userId?: string;
    name?: string;
    workspacePath?: string;
    metadata?: Record<string, unknown>;
}
export declare class SessionService {
    private db;
    constructor(db: JaitDB);
    /** Create a new session. Returns the created session record. */
    create(params?: CreateSessionParams): {
        id: string;
        userId: string | null;
        name: string | null;
        workspacePath: string | null;
        createdAt: string;
        lastActiveAt: string;
        status: string | null;
        metadata: string | null;
    };
    /** List all sessions, newest first. Optionally filter by status. */
    list(status?: string, userId?: string): {
        id: string;
        userId: string | null;
        name: string | null;
        workspacePath: string | null;
        createdAt: string;
        lastActiveAt: string;
        status: string | null;
        metadata: string | null;
    }[];
    /** Get a single session by ID. */
    getById(id: string, userId?: string): {
        id: string;
        userId: string | null;
        name: string | null;
        workspacePath: string | null;
        createdAt: string;
        lastActiveAt: string;
        status: string | null;
        metadata: string | null;
    } | undefined;
    /** Touch the session (update last_active_at). */
    touch(id: string): void;
    /** Archive a session. */
    archive(id: string, userId?: string): void;
    /** Get the most recently active session. */
    lastActive(userId?: string): {
        id: string;
        userId: string | null;
        name: string | null;
        workspacePath: string | null;
        createdAt: string;
        lastActiveAt: string;
        status: string | null;
        metadata: string | null;
    } | null;
    /** Delete (soft) a session. */
    delete(id: string, userId?: string): void;
    /** Update session name, metadata, or workspacePath. */
    update(id: string, data: {
        name?: string;
        metadata?: Record<string, unknown>;
        workspacePath?: string;
    }, userId?: string): void;
}
//# sourceMappingURL=sessions.d.ts.map