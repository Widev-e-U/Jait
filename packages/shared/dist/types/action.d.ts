export type ActionStatus = "pending" | "approved" | "executing" | "executed" | "completed" | "failed" | "reverted";
export interface ActionResponse {
    action_id: string;
    status: ActionStatus;
    surface: string;
    device_id?: string;
    preview?: {
        command?: string;
        description: string;
        side_effects: string[];
    };
    consent_url?: string;
    expires_at?: string;
}
export interface AuditEntry {
    id: string;
    timestamp: string;
    sessionId?: string | null;
    surfaceType?: string | null;
    deviceId?: string | null;
    actionId: string;
    actionType: string;
    toolName?: string | null;
    inputs?: string | null;
    outputs?: string | null;
    sideEffects?: string | null;
    status: string;
    consentMethod?: string | null;
    signature?: string | null;
    parentActionId?: string | null;
}
//# sourceMappingURL=action.d.ts.map