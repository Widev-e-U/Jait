export type TrustLevel = 0 | 1 | 2 | 3;
export interface ConsentRequest {
    actionId: string;
    toolName: string;
    summary: string;
    risk: "low" | "medium" | "high";
    createdAt: string;
    expiresAt?: string;
}
export interface ConsentDecision {
    actionId: string;
    approved: boolean;
    decidedAt: string;
    decidedBy: string;
    reason?: string;
}
export interface AuditRecord {
    actionId: string;
    sessionId: string;
    toolName: string;
    status: "started" | "completed" | "failed";
    input: string;
    output?: string;
    timestamp: string;
}
export interface SecurityService {
    requestConsent(request: ConsentRequest): Promise<ConsentDecision | null>;
    recordAudit(record: AuditRecord): Promise<void>;
    getTrustLevel(operatorId: string): Promise<TrustLevel>;
}
//# sourceMappingURL=contracts.d.ts.map