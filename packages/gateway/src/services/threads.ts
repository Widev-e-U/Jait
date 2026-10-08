/**
 * ThreadService — CRUD + lifecycle management for agent threads.
 *
 * Agent threads are parallel running agent sessions, each powered by a
 * CliProviderAdapter (jait, codex, or claude-code). Threads persist their
 * status, configuration, and activity log in SQLite via Drizzle.
 */

import { and, eq, desc, gt, sql } from "drizzle-orm";
import type { ExecutionCheckpoint } from "./execution-guard.js";
import type { JaitDB } from "../db/connection.js";
import { agentThreads, agentThreadActivities, personaAgents, threadRecovery } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";
import { limitUtf8, serializeBoundedJson } from "../lib/bounded-json.js";
import type { ProviderEvent } from "../providers/contracts.js";
import type {
  CreateThreadParams,
  RoutingPlan,
  ThreadActivity,
  UpdateThreadParams,
} from "@jait/shared/types";

const MAX_ACTIVITY_PAYLOAD_BYTES = 512_000;
const MAX_ACTIVITY_SUMMARY_BYTES = 8_000;
const TRANSIENT_ACTIVITY_KINDS = new Set([
  "thinking",
  "agent_thought_chunk",
  "codex/event/agent_reasoning_delta",
  "codex/event/exec_command_output_delta",
  "codex/event/reasoning_content_delta",
]);

function isTransientActivityKind(kind: string): boolean {
  return TRANSIENT_ACTIVITY_KINDS.has(kind);
}

// ── Types ────────────────────────────────────────────────────────────

export type {
  CreateThreadParams,
  ThreadActivity,
  ThreadStatus,
  UpdateThreadParams,
} from "@jait/shared/types";

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
  private pendingContextFlows = new Map<string, { summary: string; payload?: unknown }>();

  constructor(private db: JaitDB) {}

  listPersonaAgents(userId: string): Record<string, unknown>[] {
    return this.db.select().from(personaAgents).where(eq(personaAgents.userId, userId)).all()
      .map((row) => JSON.parse(row.data) as Record<string, unknown>);
  }

  getPersonaAgent(id: string, userId: string): Record<string, unknown> | null {
    const row = this.db.select().from(personaAgents)
      .where(and(eq(personaAgents.id, id), eq(personaAgents.userId, userId))).get();
    return row ? JSON.parse(row.data) as Record<string, unknown> : null;
  }

  savePersonaAgent(userId: string, agent: Record<string, unknown>): Record<string, unknown> {
    // Runtime view fields are computed on reads, never persisted from clients.
    const { activeTasks: _activeTasks, liveState: _liveState, ...profile } = agent;
    agent = profile;
    const id = agent.id as string;
    const existing = this.db.select().from(personaAgents).where(eq(personaAgents.id, id)).get();
    if (existing && existing.userId !== userId) throw new Error("Agent profile not found");
    const managerId = agent.reportsToId;
    if (managerId != null) {
      if (typeof managerId !== "string" || managerId === id) throw new Error("Invalid reporting line");
      const seen = new Set([id]);
      let nextId: string | null = managerId;
      while (nextId) {
        if (seen.has(nextId)) throw new Error("Invalid reporting line");
        seen.add(nextId);
        const manager = this.getPersonaAgent(nextId, userId);
        if (!manager) throw new Error("Invalid reporting line");
        nextId = typeof manager.reportsToId === "string" ? manager.reportsToId : null;
      }
    }
    const updatedAt = new Date().toISOString();
    const data = JSON.stringify({ ...agent, id, updatedAt });
    this.db.insert(personaAgents).values({ id, userId, data, updatedAt })
      .onConflictDoUpdate({ target: personaAgents.id, set: { data, updatedAt } }).run();
    return JSON.parse(data) as Record<string, unknown>;
  }

  deletePersonaAgent(id: string, userId: string): void {
    for (const report of this.listPersonaAgents(userId)) {
      if (report.reportsToId === id) this.savePersonaAgent(userId, { ...report, reportsToId: null });
    }
    this.db.update(agentThreads).set({ personaAgentId: null })
      .where(and(eq(agentThreads.personaAgentId, id), eq(agentThreads.userId, userId))).run();
    this.db.delete(personaAgents).where(and(eq(personaAgents.id, id), eq(personaAgents.userId, userId))).run();
  }

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
        personaAgentId: params.personaAgentId ?? null,
        title: params.title,
        providerId: params.providerId,
        model: params.model ?? null,
        reasoningEffort: params.reasoningEffort ?? null,
        runtimeMode: params.runtimeMode ?? "full-access",
        kind: params.kind ?? "delivery",
        skillIds: serializeSkillIds(params.skillIds) ?? null,
        workingDirectory: params.workingDirectory ?? null,
        branch: params.branch ?? null,
        prBaseBranch: params.prBaseBranch ?? null,
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

  /** Capture only work that was running at startup; manual interruptions stay stopped. */
  queueRestartRecovery(): void {
    const threads = new Map(this.listRunning().map((thread) => [thread.id, thread]));
    // A crash can happen after claiming recovery but before the provider starts.
    for (const entry of this.db.select().from(threadRecovery).all()) {
      const thread = this.getById(entry.threadId);
      if (thread?.status === "interrupted") threads.set(thread.id, thread);
    }
    for (const thread of threads.values()) {
      this.db.transaction(() => {
        const session = thread.providerSessionId;
        this.db.insert(threadRecovery).values({ threadId: thread.id, pending: true, staleProviderSessionId: session })
          .onConflictDoUpdate({ target: threadRecovery.threadId, set: { pending: true,
            ...(session ? { staleProviderSessionId: session } : {}) } }).run();
        this.update(thread.id, { status: "interrupted", providerSessionId: null,
          error: "Gateway restarted — automatically continuing saved work." });
        this.addActivity(thread.id, "session", "Gateway restarted — continuation queued");
      });
    }
  }

  listPendingRecovery() {
    return this.db.select().from(threadRecovery).where(eq(threadRecovery.pending, true)).all();
  }

  claimRecovery(id: string): boolean {
    const claimed = this.db.update(threadRecovery).set({ pending: false, attempts: sql`${threadRecovery.attempts} + 1` })
      .where(and(eq(threadRecovery.threadId, id), eq(threadRecovery.pending, true)))
      .returning().all();
    return claimed.length > 0;
  }

  getRecovery(id: string) {
    return this.db.select().from(threadRecovery).where(eq(threadRecovery.threadId, id)).get();
  }

  clearRecovery(id: string): void {
    this.db.delete(threadRecovery).where(eq(threadRecovery.threadId, id)).run();
  }

  update(id: string, params: UpdateThreadParams): ThreadRow | undefined {
    const now = new Date().toISOString();
    const updates: Partial<typeof agentThreads.$inferInsert> & { updatedAt: string } = { updatedAt: now };
    if (params.title !== undefined) updates.title = params.title;
    if (params.personaAgentId !== undefined) updates.personaAgentId = params.personaAgentId;
    if (params.providerId !== undefined) updates.providerId = params.providerId;
    if (params.model !== undefined) updates.model = params.model;
    if (params.reasoningEffort !== undefined) updates.reasoningEffort = params.reasoningEffort;
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
    if (params.changeFiles !== undefined) updates.changeFiles = params.changeFiles;
    if (params.changeInsertions !== undefined) updates.changeInsertions = params.changeInsertions;
    if (params.changeDeletions !== undefined) updates.changeDeletions = params.changeDeletions;
    this.db
      .update(agentThreads)
      .set(updates)
      .where(eq(agentThreads.id, id))
      .run();
    return this.getById(id);
  }

  delete(id: string): void {
    this.clearRecovery(id);
    this.pendingContextFlows.delete(id);
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
    this.clearRecovery(id);
    return this.update(id, {
      status: "completed",
      // Keep providerSessionId alive so the thread can be resumed
      // (e.g. to fix push failures). It gets cleared on PR merge or manual close.
      error: null,
      completedAt: new Date().toISOString(),
    });
  }

  markCompletedAndClearSession(id: string): ThreadRow | undefined {
    this.clearRecovery(id);
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
    this.clearRecovery(id);
    return this.update(id, {
      status: "error",
      providerSessionId: null,
      error,
    });
  }

  markInterrupted(id: string): ThreadRow | undefined {
    this.clearRecovery(id);
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
    const persistedSummary = limitUtf8(summary, MAX_ACTIVITY_SUMMARY_BYTES);
    this.db
      .insert(agentThreadActivities)
      .values({
        id,
        threadId,
        kind,
        summary: persistedSummary,
        payload: payload != null ? serializeBoundedJson(payload, MAX_ACTIVITY_PAYLOAD_BYTES) : null,
        createdAt: now,
      })
      .run();
    return { id, threadId, kind, summary: persistedSummary, payload, createdAt: now };
  }

  updateAssistantCheckpoint(threadId: string, activityId: string, content: string, partial: boolean): ThreadActivity | undefined {
    const row = this.db.update(agentThreadActivities).set({
      summary: limitUtf8(content.trim().slice(0, 500), MAX_ACTIVITY_SUMMARY_BYTES),
      payload: serializeBoundedJson({ role: "assistant", content, partial }, MAX_ACTIVITY_PAYLOAD_BYTES),
    }).where(and(eq(agentThreadActivities.id, activityId), eq(agentThreadActivities.threadId, threadId))).returning().get();
    return row ? { ...row, payload: row.payload ? JSON.parse(row.payload) : undefined } : undefined;
  }

  deleteActivity(threadId: string, activityId: string): void {
    this.db.delete(agentThreadActivities)
      .where(and(eq(agentThreadActivities.id, activityId), eq(agentThreadActivities.threadId, threadId))).run();
  }

  getRunStartedAt(threadId: string): string | null {
    // A new user activity marks each turn, including resumed turns. Avoid
    // updatedAt: metadata and provider events can change it during a run.
    const activity = this.db.select({ createdAt: agentThreadActivities.createdAt })
      .from(agentThreadActivities)
      .where(and(eq(agentThreadActivities.threadId, threadId),
        eq(agentThreadActivities.kind, "message"),
        sql`json_extract(${agentThreadActivities.payload}, '$.role') = 'user'`))
      .orderBy(desc(agentThreadActivities.createdAt)).limit(1).get();
    return activity?.createdAt ?? null;
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
      .orderBy(desc(agentThreadActivities.createdAt), sql`rowid DESC`);

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

  /** Task anchors are queried independently of the bounded activity tail. */
  getTaskContext(threadId: string): { originalTask?: string; latestInstruction?: string } {
    const filter = and(eq(agentThreadActivities.threadId, threadId), eq(agentThreadActivities.kind, "message"),
      sql`json_extract(${agentThreadActivities.payload}, '$.role') = 'user'`,
      sql`coalesce(json_extract(${agentThreadActivities.payload}, '$.recovery'), 0) = 0`,
      sql`coalesce(json_extract(${agentThreadActivities.payload}, '$.content'), '') NOT LIKE 'The gateway process terminated%'`);
    const first = this.db.select().from(agentThreadActivities).where(filter).orderBy(sql`rowid ASC`).limit(1).get();
    const last = this.db.select().from(agentThreadActivities).where(filter).orderBy(sql`rowid DESC`).limit(1).get();
    const content = (row: typeof first) => row?.payload ? String(JSON.parse(row.payload).content ?? JSON.parse(row.payload).fullContent ?? "") : undefined;
    return { originalTask: content(first), latestInstruction: content(last) };
  }

  getExecutionCheckpoint(threadId: string): ExecutionCheckpoint | undefined {
    const row = this.db.select().from(agentThreadActivities).where(and(eq(agentThreadActivities.threadId, threadId),
      eq(agentThreadActivities.kind, "execution.checkpoint"))).orderBy(sql`rowid DESC`).limit(1).get();
    if (!row?.payload) return undefined;
    const checkpoint = JSON.parse(row.payload) as ExecutionCheckpoint;
    if (!Number.isInteger(checkpoint.calls) || checkpoint.calls < 0 || !Array.isArray(checkpoint.evidence)
      || typeof checkpoint.failures !== "object" || !checkpoint.failures) return undefined;
    return checkpoint;
  }

  // ── Provider event → activity log mapping ───────────────────────

  private transientActivity(
    threadId: string,
    kind: string,
    summary: string,
    payload?: unknown,
  ): ThreadActivity {
    return {
      id: uuidv7(),
      threadId,
      kind,
      summary,
      payload,
      createdAt: new Date().toISOString(),
    };
  }

  private flushPendingContextFlow(threadId: string): ThreadActivity | undefined {
    const pending = this.pendingContextFlows.get(threadId);
    if (!pending) return undefined;
    this.pendingContextFlows.delete(threadId);
    return this.addActivity(threadId, "context_flow", pending.summary, pending.payload);
  }

  logProviderEvent(threadId: string, event: ProviderEvent): ThreadActivity | undefined {
    switch (event.type) {
      case "token":
        // Don't log individual tokens — too noisy
        return undefined;
      case "turn.started":
        // Don't log turn.started — it's handled by the route for status transitions.
        this.pendingContextFlows.delete(threadId);
        return undefined;
      case "tool.start":
        return this.addActivity(threadId, "tool.start", `Using ${event.tool}`, {
          tool: event.tool,
          args: event.args,
          callId: event.callId,
          parentCallId: event.parentCallId,
        });
      case "tool.result":
        return this.addActivity(
          threadId,
          event.ok ? "tool.result" : "tool.error",
          `${event.tool}: ${event.message}`,
          { tool: event.tool, ok: event.ok, message: event.message, callId: event.callId, parentCallId: event.parentCallId, data: event.data },
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
        this.pendingContextFlows.delete(threadId);
        return this.addActivity(threadId, "session", "Session started");
      case "turn.completed":
        this.flushPendingContextFlow(threadId);
        return this.addActivity(threadId, "session", "Turn completed — ready for input");
      case "session.completed":
        this.flushPendingContextFlow(threadId);
        return this.addActivity(threadId, "session", "Session completed");
      case "session.error":
        this.flushPendingContextFlow(threadId);
        return this.addActivity(threadId, "error", event.error);
      case "activity": {
        if (event.kind === "context_flow") {
          this.pendingContextFlows.set(threadId, {
            summary: event.summary,
            payload: event.payload,
          });
          return this.transientActivity(threadId, event.kind, event.summary, event.payload);
        }
        if (isTransientActivityKind(event.kind)) {
          return this.transientActivity(threadId, event.kind, event.summary, event.payload);
        }
        return this.addActivity(threadId, event.kind, event.summary, event.payload);
      }
      default:
        return undefined;
    }
  }
}
