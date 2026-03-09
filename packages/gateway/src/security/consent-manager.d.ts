/**
 * Consent Manager — Sprint 4.1
 *
 * Manages a pending queue of consent requests. Tools that require
 * consent produce a request; the operator must approve/reject before
 * execution continues. Requests auto-timeout after a configurable period.
 */
import type { JaitDB } from "../db/connection.js";
export type ConsentStatus = "pending" | "approved" | "rejected" | "timeout";
export interface ConsentRequest {
    id: string;
    actionId: string;
    toolName: string;
    summary: string;
    /** Preview of what will execute (command, file path, etc.) */
    preview: Record<string, unknown>;
    risk: "low" | "medium" | "high";
    sessionId: string;
    createdAt: string;
    expiresAt: string;
    status: ConsentStatus;
}
export interface ConsentDecision {
    requestId: string;
    actionId: string;
    approved: boolean;
    decidedAt: string;
    decidedVia: "click" | "voice" | "auto" | "timeout";
    reason?: string;
}
export interface ConsentManagerOptions {
    /** Timeout in milliseconds before a request auto-rejects (default: 120_000 = 2 min) */
    defaultTimeoutMs?: number;
    /** DB instance for writing to consent_log table */
    db?: JaitDB;
    /** Called whenever a new consent request is created */
    onRequest?: (request: ConsentRequest) => void;
    /** Called whenever a consent decision is made */
    onDecision?: (decision: ConsentDecision) => void;
}
export declare class ConsentManager {
    private readonly pending;
    private readonly approveAllSessions;
    private readonly defaultTimeoutMs;
    private readonly db?;
    private readonly onRequest?;
    private readonly onDecision?;
    constructor(opts?: ConsentManagerOptions);
    /**
     * Create a consent request and wait for approval/rejection.
     * Returns the decision (approved=true/false). Rejects after timeout.
     */
    requestConsent(params: {
        actionId: string;
        toolName: string;
        summary: string;
        preview: Record<string, unknown>;
        risk: "low" | "medium" | "high";
        sessionId: string;
        timeoutMs?: number;
    }): Promise<ConsentDecision>;
    /**
     * Approve a pending request. Returns false if the request doesn't exist.
     */
    approve(requestId: string, via?: ConsentDecision["decidedVia"], reason?: string): boolean;
    /**
     * Reject a pending request. Returns false if the request doesn't exist.
     */
    reject(requestId: string, via?: ConsentDecision["decidedVia"], reason?: string): boolean;
    /**
     * Get a pending request by ID.
     */
    getRequest(requestId: string): ConsentRequest | undefined;
    /**
     * Get all pending requests, optionally filtered by session.
     */
    listPending(sessionId?: string): ConsentRequest[];
    /**
     * Get count of pending requests.
     */
    get pendingCount(): number;
    /**
     * Enable "approve all" mode for a session.
     * While enabled, consent prompts for this session should be bypassed by the executor.
     */
    enableApproveAllForSession(sessionId: string): void;
    /**
     * Disable "approve all" mode for a session.
     */
    disableApproveAllForSession(sessionId: string): void;
    /**
     * Check whether "approve all" mode is enabled for a session.
     */
    isApproveAllEnabledForSession(sessionId: string): boolean;
    /**
     * Cancel all pending requests (e.g. during shutdown).
     */
    cancelAll(reason?: string): void;
    private decide;
    private handleTimeout;
    private persistDecision;
    private hydrateSessionApproveAll;
    private persistSessionApproveAll;
}
//# sourceMappingURL=consent-manager.d.ts.map