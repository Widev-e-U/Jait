import type { JaitDB } from "../db/connection.js";
export interface AuditEntry {
    sessionId?: string;
    surfaceType?: string;
    deviceId?: string;
    actionId: string;
    actionType: string;
    toolName?: string;
    inputs?: unknown;
    outputs?: unknown;
    sideEffects?: unknown;
    parentActionId?: string;
    status: string;
    consentMethod?: string;
}
export declare class AuditWriter {
    private db;
    constructor(db: JaitDB);
    /** Write a new audit log entry. Returns the entry's id. */
    write(entry: AuditEntry): string;
    /** Check if an action ID already exists (idempotency guard). */
    hasAction(actionId: string): boolean;
    /** Get all audit entries for a session, newest first. */
    getBySession(sessionId: string): {
        id: string;
        timestamp: string;
        sessionId: string | null;
        surfaceType: string | null;
        deviceId: string | null;
        actionId: string | null;
        actionType: string | null;
        toolName: string | null;
        inputs: string | null;
        outputs: string | null;
        sideEffects: string | null;
        signature: string | null;
        parentActionId: string | null;
        status: string | null;
        consentMethod: string | null;
    }[];
    /** Get all audit entries (newest first). */
    getAll(): {
        id: string;
        timestamp: string;
        sessionId: string | null;
        surfaceType: string | null;
        deviceId: string | null;
        actionId: string | null;
        actionType: string | null;
        toolName: string | null;
        inputs: string | null;
        outputs: string | null;
        sideEffects: string | null;
        signature: string | null;
        parentActionId: string | null;
        status: string | null;
        consentMethod: string | null;
    }[];
}
//# sourceMappingURL=audit.d.ts.map