/**
 * Consent Manager — Sprint 4.1
 *
 * Manages a pending queue of consent requests. Tools that require
 * consent produce a request; the operator must approve/reject before
 * execution continues. Requests auto-timeout after a configurable period.
 */
import { consentLog, consentSessionApprovals } from "../db/schema.js";
import { uuidv7 } from "../lib/uuidv7.js";
import { eq } from "drizzle-orm";
// ── ConsentManager ───────────────────────────────────────────────────
export class ConsentManager {
    pending = new Map();
    approveAllSessions = new Set();
    defaultTimeoutMs;
    db;
    onRequest;
    onDecision;
    constructor(opts = {}) {
        this.defaultTimeoutMs = opts.defaultTimeoutMs ?? 120_000;
        this.db = opts.db;
        this.onRequest = opts.onRequest;
        this.onDecision = opts.onDecision;
        this.hydrateSessionApproveAll();
    }
    /**
     * Create a consent request and wait for approval/rejection.
     * Returns the decision (approved=true/false). Rejects after timeout.
     */
    async requestConsent(params) {
        const timeout = params.timeoutMs ?? this.defaultTimeoutMs;
        const now = new Date();
        const expiresAt = new Date(now.getTime() + timeout);
        const request = {
            id: uuidv7(),
            actionId: params.actionId,
            toolName: params.toolName,
            summary: params.summary,
            preview: params.preview,
            risk: params.risk,
            sessionId: params.sessionId,
            createdAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
            status: "pending",
        };
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.handleTimeout(request.id);
            }, timeout);
            this.pending.set(request.id, { request, resolve, timer });
            // Notify listeners (e.g. WS broadcast)
            this.onRequest?.(request);
        });
    }
    /**
     * Approve a pending request. Returns false if the request doesn't exist.
     */
    approve(requestId, via = "click", reason) {
        return this.decide(requestId, true, via, reason);
    }
    /**
     * Reject a pending request. Returns false if the request doesn't exist.
     */
    reject(requestId, via = "click", reason) {
        return this.decide(requestId, false, via, reason);
    }
    /**
     * Get a pending request by ID.
     */
    getRequest(requestId) {
        return this.pending.get(requestId)?.request;
    }
    /**
     * Get all pending requests, optionally filtered by session.
     */
    listPending(sessionId) {
        const all = [...this.pending.values()].map((e) => e.request);
        if (sessionId)
            return all.filter((r) => r.sessionId === sessionId);
        return all;
    }
    /**
     * Get count of pending requests.
     */
    get pendingCount() {
        return this.pending.size;
    }
    /**
     * Enable "approve all" mode for a session.
     * While enabled, consent prompts for this session should be bypassed by the executor.
     */
    enableApproveAllForSession(sessionId) {
        this.approveAllSessions.add(sessionId);
        this.persistSessionApproveAll(sessionId, true);
    }
    /**
     * Disable "approve all" mode for a session.
     */
    disableApproveAllForSession(sessionId) {
        this.approveAllSessions.delete(sessionId);
        this.persistSessionApproveAll(sessionId, false);
    }
    /**
     * Check whether "approve all" mode is enabled for a session.
     */
    isApproveAllEnabledForSession(sessionId) {
        return this.approveAllSessions.has(sessionId);
    }
    /**
     * Cancel all pending requests (e.g. during shutdown).
     */
    cancelAll(reason = "shutdown") {
        for (const id of [...this.pending.keys()]) {
            this.decide(id, false, "auto", reason);
        }
    }
    // ── Internal ─────────────────────────────────────────────────────
    decide(requestId, approved, via, reason) {
        const entry = this.pending.get(requestId);
        if (!entry)
            return false;
        clearTimeout(entry.timer);
        const decision = {
            requestId,
            actionId: entry.request.actionId,
            approved,
            decidedAt: new Date().toISOString(),
            decidedVia: via,
            reason,
        };
        entry.request.status = approved ? "approved" : "rejected";
        // Persist to consent_log
        this.persistDecision(entry.request, decision);
        // Remove from pending
        this.pending.delete(requestId);
        // Notify listeners
        this.onDecision?.(decision);
        // Resolve the waiting promise
        entry.resolve(decision);
        return true;
    }
    handleTimeout(requestId) {
        const entry = this.pending.get(requestId);
        if (!entry)
            return;
        const decision = {
            requestId,
            actionId: entry.request.actionId,
            approved: false,
            decidedAt: new Date().toISOString(),
            decidedVia: "timeout",
            reason: "Consent request timed out",
        };
        entry.request.status = "timeout";
        this.persistDecision(entry.request, decision);
        this.pending.delete(requestId);
        this.onDecision?.(decision);
        entry.resolve(decision);
    }
    persistDecision(request, decision) {
        if (!this.db)
            return;
        try {
            this.db.insert(consentLog).values({
                id: uuidv7(),
                actionId: request.actionId,
                toolName: request.toolName,
                decision: decision.approved ? "approved" : decision.decidedVia === "timeout" ? "timeout" : "rejected",
                decidedAt: decision.decidedAt,
                decidedVia: decision.decidedVia,
            }).run();
        }
        catch {
            // Non-fatal: consent log is for audit, not control flow
        }
    }
    hydrateSessionApproveAll() {
        if (!this.db)
            return;
        try {
            const rows = this.db
                .select()
                .from(consentSessionApprovals)
                .where(eq(consentSessionApprovals.approveAll, 1))
                .all();
            for (const row of rows) {
                this.approveAllSessions.add(row.sessionId);
            }
        }
        catch {
            // Non-fatal: default to no persisted overrides
        }
    }
    persistSessionApproveAll(sessionId, enabled) {
        if (!this.db)
            return;
        try {
            if (enabled) {
                this.db
                    .insert(consentSessionApprovals)
                    .values({
                    sessionId,
                    approveAll: 1,
                    updatedAt: new Date().toISOString(),
                })
                    .onConflictDoUpdate({
                    target: consentSessionApprovals.sessionId,
                    set: {
                        approveAll: 1,
                        updatedAt: new Date().toISOString(),
                    },
                })
                    .run();
            }
            else {
                this.db
                    .delete(consentSessionApprovals)
                    .where(eq(consentSessionApprovals.sessionId, sessionId))
                    .run();
            }
        }
        catch {
            // Non-fatal: in-memory state is source of truth for this process
        }
    }
}
//# sourceMappingURL=consent-manager.js.map