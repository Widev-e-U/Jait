/**
 * Consent Manager — Sprint 4.1
 *
 * Manages a pending queue of consent requests. Tools that require
 * consent produce a request; the operator must approve/reject before
 * execution continues. Requests auto-timeout after a configurable period.
 */

import type { JaitDB } from "../db/connection.js";
import { consentLog, consentSessionApprovals } from "../db/schema.js";
import { uuidv7 } from "../lib/uuidv7.js";
import { eq } from "drizzle-orm";

// ── Types ────────────────────────────────────────────────────────────

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

// ── Pending Entry ────────────────────────────────────────────────────

interface PendingEntry {
  request: ConsentRequest;
  resolve: (decision: ConsentDecision) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ── ConsentManager ───────────────────────────────────────────────────

export class ConsentManager {
  private readonly pending = new Map<string, PendingEntry>();
  private readonly approveAllSessions = new Set<string>();
  private readonly defaultTimeoutMs: number;
  private readonly db?: JaitDB;
  private readonly onRequest?: (request: ConsentRequest) => void;
  private readonly onDecision?: (decision: ConsentDecision) => void;

  constructor(opts: ConsentManagerOptions = {}) {
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
  async requestConsent(params: {
    actionId: string;
    toolName: string;
    summary: string;
    preview: Record<string, unknown>;
    risk: "low" | "medium" | "high";
    sessionId: string;
    timeoutMs?: number;
  }): Promise<ConsentDecision> {
    const timeout = params.timeoutMs ?? this.defaultTimeoutMs;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + timeout);

    const request: ConsentRequest = {
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

    return new Promise<ConsentDecision>((resolve) => {
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
  approve(requestId: string, via: ConsentDecision["decidedVia"] = "click", reason?: string): boolean {
    return this.decide(requestId, true, via, reason);
  }

  /**
   * Reject a pending request. Returns false if the request doesn't exist.
   */
  reject(requestId: string, via: ConsentDecision["decidedVia"] = "click", reason?: string): boolean {
    return this.decide(requestId, false, via, reason);
  }

  /**
   * Get a pending request by ID.
   */
  getRequest(requestId: string): ConsentRequest | undefined {
    return this.pending.get(requestId)?.request;
  }

  /**
   * Get all pending requests, optionally filtered by session.
   */
  listPending(sessionId?: string): ConsentRequest[] {
    const all = [...this.pending.values()].map((e) => e.request);
    if (sessionId) return all.filter((r) => r.sessionId === sessionId);
    return all;
  }

  /**
   * Get count of pending requests.
   */
  get pendingCount(): number {
    return this.pending.size;
  }

  /**
   * Enable "approve all" mode for a session.
   * While enabled, consent prompts for this session should be bypassed by the executor.
   */
  enableApproveAllForSession(sessionId: string): void {
    this.approveAllSessions.add(sessionId);
    this.persistSessionApproveAll(sessionId, true);
  }

  /**
   * Disable "approve all" mode for a session.
   */
  disableApproveAllForSession(sessionId: string): void {
    this.approveAllSessions.delete(sessionId);
    this.persistSessionApproveAll(sessionId, false);
  }

  /**
   * Check whether "approve all" mode is enabled for a session.
   */
  isApproveAllEnabledForSession(sessionId: string): boolean {
    return this.approveAllSessions.has(sessionId);
  }

  /**
   * Cancel all pending requests (e.g. during shutdown).
   */
  cancelAll(reason = "shutdown"): void {
    for (const id of [...this.pending.keys()]) {
      this.decide(id, false, "auto", reason);
    }
  }

  // ── Internal ─────────────────────────────────────────────────────

  private decide(
    requestId: string,
    approved: boolean,
    via: ConsentDecision["decidedVia"],
    reason?: string,
  ): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;

    clearTimeout(entry.timer);

    const decision: ConsentDecision = {
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

  private handleTimeout(requestId: string): void {
    const entry = this.pending.get(requestId);
    if (!entry) return;

    const decision: ConsentDecision = {
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

  private persistDecision(request: ConsentRequest, decision: ConsentDecision): void {
    if (!this.db) return;

    try {
      this.db.insert(consentLog).values({
        id: uuidv7(),
        actionId: request.actionId,
        toolName: request.toolName,
        decision: decision.approved ? "approved" : decision.decidedVia === "timeout" ? "timeout" : "rejected",
        decidedAt: decision.decidedAt,
        decidedVia: decision.decidedVia,
      }).run();
    } catch {
      // Non-fatal: consent log is for audit, not control flow
    }
  }

  private hydrateSessionApproveAll(): void {
    if (!this.db) return;
    try {
      const rows = this.db
        .select()
        .from(consentSessionApprovals)
        .where(eq(consentSessionApprovals.approveAll, 1))
        .all();
      for (const row of rows) {
        this.approveAllSessions.add(row.sessionId);
      }
    } catch {
      // Non-fatal: default to no persisted overrides
    }
  }

  private persistSessionApproveAll(sessionId: string, enabled: boolean): void {
    if (!this.db) return;
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
      } else {
        this.db
          .delete(consentSessionApprovals)
          .where(eq(consentSessionApprovals.sessionId, sessionId))
          .run();
      }
    } catch {
      // Non-fatal: in-memory state is source of truth for this process
    }
  }
}
