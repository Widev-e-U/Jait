/**
 * ThreadService — CRUD + lifecycle management for agent threads.
 *
 * Agent threads are parallel running agent sessions, each powered by a
 * CliProviderAdapter (jait, codex, or claude-code). Threads persist their
 * status, configuration, and activity log in SQLite via Drizzle.
 */

import { and, eq, desc, gt } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { agentThreads, agentThreadActivities } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";
import type {
  ProviderId,
  RuntimeMode,
  ProviderEvent,
} from "../providers/contracts.js";
import type { RoutingPlan } from "@jait/shared/types";

// ── Types ────────────────────────────────────────────────────────────

export type ThreadStatus =
  | "idle"
  | "running"
  | "completed"
  | "error"
  | "interrupted";

export interface CreateThreadParams {
  userId?: string;
  sessionId?: string;
  title: string;
  providerId: ProviderId;
  model?: string;
  runtimeMode?: RuntimeMode;
  kind?: "delivery" | "delegation";
  skillIds?: string[] | null;
  workingDirectory?: string;
  branch?: string;
}

export interface UpdateThreadParams {
  title?: string;
  providerId?: ProviderId;
  model?: string;
  runtimeMode?: RuntimeMode;
  kind?: "delivery" | "delegation";
  skillIds?: string[] | null;
  workingDirectory?: string | null;
  branch?: string | null;
  prUrl?: string | null;
  prNumber?: number | null;
  prTitle?: string | null;
  prBaseBranch?: string | null;
  prState?: "creating" | "open" | "closed" | "merged" | null;
  status?: ThreadStatus;
  providerSessionId?: string | null;
  error?: string | null;
  completedAt?: string | null;
  executionNodeId?: string | null;
  executionNodeName?: string | null;
  routingPlan?: RoutingPlan | null;
}

export interface ThreadActivity {
  id: string;
  threadId: string;
  kind: string;
  summary: string;
  payload?: unknown;
  createdAt: string;
}

type ThreadRowRecord = typeof agentThreads.$inferSelect;
export type ThreadRow = Omit<ThreadRowRecord, "skillIds" | "routingPlan"> & {
  skillIds: string[] | null;
  routingPlan: RoutingPlan | null;
};

function serializeSkillIds(skillIds: string[] | null | undefined): string | null | undefined {
  if (skillIds === undefined) return undefined;
  if (skillIds === null) return null;
  const normalized = [...new Set(skillIds.filter((id) => typeof id === "string").map((id) => id.trim()).filter(Boolean))];
  return JSON.stringify(normalized);
}

function parseSkillIds(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const normalized = [...new Set(parsed.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean))];
    return normalized;
  } catch {
    return null;
  }
}

function parseRoutingPlan(raw: string | null): RoutingPlan | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RoutingPlan;
  } catch {
    return null;
  }
}

function hydrateThreadRow(row: ThreadRowRecord | undefined): ThreadRow | undefined {
  if (!row) return undefined;
  return {
    ...row,
    skillIds: parseSkillIds(row.skillIds),
    routingPlan: parseRoutingPlan(row.routingPlan),
  };
}

// ── Service ──────────────────────────────────────────────────────────

export class ThreadService {
  constructor(private db: JaitDB) {}

  // ── CRUD ─────────────────────────────────────────────────────────

  create(params: CreateThreadParams): ThreadRow {
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
        kind: params.kind ?? "delivery",
        skillIds: serializeSkillIds(params.skillIds) ?? null,
        workingDirectory: params.workingDirectory ?? null,
        branch: params.branch ?? null,
        status: "idle",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return this.getById(id)!;
  }

  getById(id: string): ThreadRow | undefined {
    return hydrateThreadRow(this.db
      .select()
      .from(agentThreads)
      .where(eq(agentThreads.id, id))
      .get());
  }

  list(userId?: string, limit?: number): ThreadRow[] {
    const normalizedLimit =
      typeof limit === "number" && Number.isFinite(limit) && limit > 0
        ? Math.floor(limit)
        : undefined;
    const base = this.db.select().from(agentThreads);
    if (userId) {
      const query = base
        .where(eq(agentThreads.userId, userId))
        .orderBy(desc(agentThreads.updatedAt));
      const rows = normalizedLimit ? query.limit(normalizedLimit).all() : query.all();
      return rows.map((row) => hydrateThreadRow(row)!);
    }
    const query = base.orderBy(desc(agentThreads.updatedAt));
    const rows = normalizedLimit ? query.limit(normalizedLimit).all() : query.all();
    return rows.map((row) => hydrateThreadRow(row)!);
  }

  listBySession(sessionId: string, limit?: number): ThreadRow[] {
    const normalizedLimit =
      typeof limit === "number" && Number.isFinite(limit) && limit > 0
        ? Math.floor(limit)
        : undefined;
    const query = this.db
      .select()
      .from(agentThreads)
      .where(eq(agentThreads.sessionId, sessionId))
      .orderBy(desc(agentThreads.updatedAt));
    const rows = normalizedLimit ? query.limit(normalizedLimit).all() : query.all();
    return rows.map((row) => hydrateThreadRow(row)!);
  }

  listRunning(): ThreadRow[] {
    return this.db
      .select()
      .from(agentThreads)
      .where(eq(agentThreads.status, "running"))
      .orderBy(desc(agentThreads.updatedAt))
      .all()
      .map((row) => hydrateThreadRow(row)!);
  }

  update(id: string, params: UpdateThreadParams): ThreadRow | undefined {
    const now = new Date().toISOString();
    const updates: Partial<typeof agentThreads.$inferInsert> & { updatedAt: string } = { updatedAt: now };
    if (params.title !== undefined) updates.title = params.title;
    if (params.providerId !== undefined) updates.providerId = params.providerId;
    if (params.model !== undefined) updates.model = params.model;
    if (params.runtimeMode !== undefined) updates.runtimeMode = params.runtimeMode;
    if (params.kind !== undefined) updates.kind = params.kind;
    if (params.skillIds !== undefined) updates.skillIds = serializeSkillIds(params.skillIds) ?? null;
    if (params.workingDirectory !== undefined) updates.workingDirectory = params.workingDirectory;
    if (params.branch !== undefined) updates.branch = params.branch;
    if (params.prUrl !== undefined) updates.prUrl = params.prUrl;
    if (params.prNumber !== undefined) updates.prNumber = params.prNumber;
    if (params.prTitle !== undefined) updates.prTitle = params.prTitle;
    if (params.prBaseBranch !== undefined) updates.prBaseBranch = params.prBaseBranch;
    if (params.prState !== undefined) updates.prState = params.prState;
    if (params.status !== undefined) updates.status = params.status;
    if (params.providerSessionId !== undefined) updates.providerSessionId = params.providerSessionId;
    if (params.error !== undefined) updates.error = params.error;
    if (params.completedAt !== undefined) updates.completedAt = params.completedAt;
    if (params.executionNodeId !== undefined) updates.executionNodeId = params.executionNodeId;
    if (params.executionNodeName !== undefined) updates.executionNodeName = params.executionNodeName;
    if (params.routingPlan !== undefined) updates.routingPlan = params.routingPlan ? JSON.stringify(params.routingPlan) : null;
    this.db
      .update(agentThreads)
      .set(updates)
      .where(eq(agentThreads.id, id))
      .run();
    return this.getById(id);
  }

  delete(id: string): void {
    // Delete activities first, then the thread
    this.db
      .delete(agentThreadActivities)
      .where(eq(agentThreadActivities.threadId, id))
      .run();
    this.db.delete(agentThreads).where(eq(agentThreads.id, id)).run();
  }

  // ── Status transitions ──────────────────────────────────────────

  markRunning(id: string, providerSessionId: string): ThreadRow | undefined {
    return this.update(id, {
      status: "running",
      providerSessionId,
      error: null,
      completedAt: null,
    });
  }

  markCompleted(id: string): ThreadRow | undefined {
    return this.update(id, {
      status: "completed",
      // Keep providerSessionId alive so the thread can be resumed
      // (e.g. to fix push failures). It gets cleared on PR merge or manual close.
      error: null,
      completedAt: new Date().toISOString(),
    });
  }

  markCompletedAndClearSession(id: string): ThreadRow | undefined {
    return this.update(id, {
      status: "completed",
      providerSessionId: null,
      error: null,
      completedAt: new Date().toISOString(),
    });
  }

  /** Clear the provider session — called when a PR is merged or the thread is manually closed. */
  clearSession(id: string): ThreadRow | undefined {
    return this.update(id, {
      providerSessionId: null,
    });
  }

  markError(id: string, error: string): ThreadRow | undefined {
    return this.update(id, {
      status: "error",
      providerSessionId: null,
      error,
    });
  }

  markInterrupted(id: string): ThreadRow | undefined {
    return this.update(id, {
      status: "interrupted",
      providerSessionId: null,
    });
  }

  // ── Activities ──────────────────────────────────────────────────

  addActivity(
    threadId: string,
    kind: string,
    summary: string,
    payload?: unknown,
  ): ThreadActivity {
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

  getActivities(
    threadId: string,
    limit?: number,
    after?: string,
  ): ThreadActivity[] {
    const filters = [eq(agentThreadActivities.threadId, threadId)];
    if (after) {
      filters.push(gt(agentThreadActivities.createdAt, after));
    }

    const baseQuery = this.db
      .select()
      .from(agentThreadActivities)
      .where(filters.length === 1 ? filters[0]! : and(...filters))
      .orderBy(desc(agentThreadActivities.createdAt));

    const query =
      typeof limit === "number" && Number.isFinite(limit) && limit > 0
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

  logProviderEvent(threadId: string, event: ProviderEvent): ThreadActivity | undefined {
    switch (event.type) {
      case "token":
        // Don't log individual tokens — too noisy
        return undefined;
      case "turn.started":
        // Don't log turn.started — it's handled by the route for status transitions
        return undefined;
      case "tool.start":
        return this.addActivity(threadId, "tool.start", `Using ${event.tool}`, {
          tool: event.tool,
          args: event.args,
          callId: event.callId,
        });
      case "tool.result":
        return this.addActivity(
          threadId,
          event.ok ? "tool.result" : "tool.error",
          `${event.tool}: ${event.message}`,
          { tool: event.tool, ok: event.ok, message: event.message, callId: event.callId, data: event.data },
        );
      case "tool.output":
        // Don't persist per-delta output — too noisy (like tokens).
        // The frontend can reconstruct final output from tool.result.
        return undefined;
      case "tool.approval-required":
        return this.addActivity(
          threadId,
          "tool.approval",
          `Approval required: ${event.tool}`,
          { tool: event.tool, args: event.args, requestId: event.requestId },
        );
      case "message":
        // User messages are already persisted by the route handler (/start, /send).
        // Only persist assistant messages from provider events to avoid duplicates.
        if (event.role === "user") return undefined;
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
