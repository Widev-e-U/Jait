/**
 * ThreadService — CRUD + lifecycle management for agent threads.
 *
 * Agent threads are parallel running agent sessions, each powered by a
 * CliProviderAdapter (jait, codex, or claude-code). Threads persist their
 * status, configuration, and activity log in SQLite via Drizzle.
 */
import { and, eq, desc, gt } from "drizzle-orm";
import { agentThreads, agentThreadActivities } from "../db/schema.js";
import { uuidv7 } from "../lib/uuidv7.js";
// ── Service ──────────────────────────────────────────────────────────
export class ThreadService {
    db;
    constructor(db) {
        this.db = db;
    }
    // ── CRUD ─────────────────────────────────────────────────────────
    create(params) {
        const id = uuidv7();
        const now = new Date().toISOString();
        this.db
            .insert(agentThreads)
            .values({
            id,
            userId: params.userId ?? null,
            sessionId: params.sessionId ?? null,
            title: params.title,
            providerId: params.providerId,
            model: params.model ?? null,
            runtimeMode: params.runtimeMode ?? "full-access",
            workingDirectory: params.workingDirectory ?? null,
            branch: params.branch ?? null,
            status: "running",
            createdAt: now,
            updatedAt: now,
        })
            .run();
        return this.getById(id);
    }
    getById(id) {
        return this.db
            .select()
            .from(agentThreads)
            .where(eq(agentThreads.id, id))
            .get();
    }
    list(userId) {
        const base = this.db.select().from(agentThreads);
        if (userId) {
            return base
                .where(eq(agentThreads.userId, userId))
                .orderBy(desc(agentThreads.updatedAt))
                .all();
        }
        return base.orderBy(desc(agentThreads.updatedAt)).all();
    }
    listBySession(sessionId) {
        return this.db
            .select()
            .from(agentThreads)
            .where(eq(agentThreads.sessionId, sessionId))
            .orderBy(desc(agentThreads.updatedAt))
            .all();
    }
    listRunning() {
        return this.db
            .select()
            .from(agentThreads)
            .where(eq(agentThreads.status, "running"))
            .orderBy(desc(agentThreads.updatedAt))
            .all();
    }
    update(id, params) {
        const now = new Date().toISOString();
        this.db
            .update(agentThreads)
            .set({ ...params, updatedAt: now })
            .where(eq(agentThreads.id, id))
            .run();
        return this.getById(id);
    }
    delete(id) {
        // Delete activities first, then the thread
        this.db
            .delete(agentThreadActivities)
            .where(eq(agentThreadActivities.threadId, id))
            .run();
        this.db.delete(agentThreads).where(eq(agentThreads.id, id)).run();
    }
    // ── Status transitions ──────────────────────────────────────────
    markRunning(id, providerSessionId) {
        return this.update(id, {
            status: "running",
            providerSessionId,
            error: null,
        });
    }
    markCompleted(id) {
        return this.update(id, {
            status: "completed",
            providerSessionId: null,
            completedAt: new Date().toISOString(),
        });
    }
    markError(id, error) {
        return this.update(id, {
            status: "error",
            providerSessionId: null,
            error,
        });
    }
    markInterrupted(id) {
        return this.update(id, {
            status: "interrupted",
            providerSessionId: null,
        });
    }
    // ── Activities ──────────────────────────────────────────────────
    addActivity(threadId, kind, summary, payload) {
        const id = uuidv7();
        const now = new Date().toISOString();
        this.db
            .insert(agentThreadActivities)
            .values({
            id,
            threadId,
            kind,
            summary,
            payload: payload != null ? JSON.stringify(payload) : null,
            createdAt: now,
        })
            .run();
        return { id, threadId, kind, summary, payload, createdAt: now };
    }
    getActivities(threadId, limit, after) {
        const filters = [eq(agentThreadActivities.threadId, threadId)];
        if (after) {
            filters.push(gt(agentThreadActivities.createdAt, after));
        }
        const baseQuery = this.db
            .select()
            .from(agentThreadActivities)
            .where(filters.length === 1 ? filters[0] : and(...filters))
            .orderBy(desc(agentThreadActivities.createdAt));
        const query = typeof limit === "number" && Number.isFinite(limit) && limit > 0
            ? baseQuery.limit(limit)
            : baseQuery;
        const rows = query.all();
        return rows.map((r) => ({
            id: r.id,
            threadId: r.threadId,
            kind: r.kind,
            summary: r.summary,
            payload: r.payload ? JSON.parse(r.payload) : undefined,
            createdAt: r.createdAt,
        }));
    }
    // ── Provider event → activity log mapping ───────────────────────
    logProviderEvent(threadId, event) {
        switch (event.type) {
            case "token":
                // Don't log individual tokens — too noisy
                return undefined;
            case "tool.start":
                return this.addActivity(threadId, "tool.start", `Using ${event.tool}`, {
                    tool: event.tool,
                    args: event.args,
                    callId: event.callId,
                });
            case "tool.result":
                return this.addActivity(threadId, event.ok ? "tool.result" : "tool.error", `${event.tool}: ${event.message}`, { tool: event.tool, ok: event.ok, message: event.message, callId: event.callId });
            case "tool.output":
                // Don't persist per-delta output — too noisy (like tokens).
                // The frontend can reconstruct final output from tool.result.
                return undefined;
            case "tool.approval-required":
                return this.addActivity(threadId, "tool.approval", `Approval required: ${event.tool}`, { tool: event.tool, args: event.args, requestId: event.requestId });
            case "message":
                // User messages are already persisted by the route handler (/start, /send).
                // Only persist assistant messages from provider events to avoid duplicates.
                if (event.role === "user")
                    return undefined;
                return this.addActivity(threadId, "message", event.content.slice(0, 500), {
                    role: event.role,
                    content: event.content,
                });
            case "session.started":
                return this.addActivity(threadId, "session", "Session started");
            case "turn.completed":
                return this.addActivity(threadId, "session", "Turn completed — ready for input");
            case "session.completed":
                return this.addActivity(threadId, "session", "Session completed");
            case "session.error":
                return this.addActivity(threadId, "error", event.error);
            case "activity":
                return this.addActivity(threadId, event.kind, event.summary, event.payload);
            default:
                return undefined;
        }
    }
}
//# sourceMappingURL=threads.js.map