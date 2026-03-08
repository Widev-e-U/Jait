/**
 * ThreadService — CRUD + lifecycle management for agent threads.
 *
 * Agent threads are parallel running agent sessions, each powered by a
 * CliProviderAdapter (jait, codex, or claude-code). Threads persist their
 * status, configuration, and activity log in SQLite via Drizzle.
 */

import { and, eq, desc } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { agentThreads, agentThreadActivities } from "../db/schema.js";
import { uuidv7 } from "../lib/uuidv7.js";
import type {
  ProviderId,
  RuntimeMode,
  ProviderEvent,
} from "../providers/contracts.js";

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
  workingDirectory?: string;
  branch?: string;
}

export interface UpdateThreadParams {
  title?: string;
  model?: string;
  runtimeMode?: RuntimeMode;
  workingDirectory?: string;
  branch?: string;
  prUrl?: string | null;
  prNumber?: number | null;
  prTitle?: string | null;
  prState?: "open" | "closed" | "merged" | null;
  status?: ThreadStatus;
  providerSessionId?: string | null;
  error?: string | null;
  completedAt?: string | null;
}

export interface ThreadActivity {
  id: string;
  threadId: string;
  kind: string;
  summary: string;
  payload?: unknown;
  createdAt: string;
}

export type ThreadRow = typeof agentThreads.$inferSelect;

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
    return this.db
      .select()
      .from(agentThreads)
      .where(eq(agentThreads.id, id))
      .get();
  }

  list(userId?: string): ThreadRow[] {
    const base = this.db.select().from(agentThreads);
    if (userId) {
      return base
        .where(eq(agentThreads.userId, userId))
        .orderBy(desc(agentThreads.updatedAt))
        .all();
    }
    return base.orderBy(desc(agentThreads.updatedAt)).all();
  }

  listBySession(sessionId: string): ThreadRow[] {
    return this.db
      .select()
      .from(agentThreads)
      .where(eq(agentThreads.sessionId, sessionId))
      .orderBy(desc(agentThreads.updatedAt))
      .all();
  }

  listRunning(): ThreadRow[] {
    return this.db
      .select()
      .from(agentThreads)
      .where(eq(agentThreads.status, "running"))
      .orderBy(desc(agentThreads.updatedAt))
      .all();
  }

  update(id: string, params: UpdateThreadParams): ThreadRow | undefined {
    const now = new Date().toISOString();
    this.db
      .update(agentThreads)
      .set({ ...params, updatedAt: now })
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
    });
  }

  markCompleted(id: string): ThreadRow | undefined {
    return this.update(id, {
      status: "completed",
      providerSessionId: null,
      completedAt: new Date().toISOString(),
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
    limit = 100,
    after?: string,
  ): ThreadActivity[] {
    let query = this.db
      .select()
      .from(agentThreadActivities)
      .where(
        after
          ? and(
              eq(agentThreadActivities.threadId, threadId),
              // Simple comparison works for ISO timestamps
            )
          : eq(agentThreadActivities.threadId, threadId),
      )
      .orderBy(desc(agentThreadActivities.createdAt))
      .limit(limit);

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

  logProviderEvent(threadId: string, event: ProviderEvent): void {
    switch (event.type) {
      case "token":
        // Don't log individual tokens — too noisy
        break;
      case "tool.start":
        this.addActivity(threadId, "tool.start", `Using ${event.tool}`, {
          tool: event.tool,
          args: event.args,
        });
        break;
      case "tool.result":
        this.addActivity(
          threadId,
          event.ok ? "tool.result" : "tool.error",
          `${event.tool}: ${event.message}`,
          { tool: event.tool, ok: event.ok, message: event.message },
        );
        break;
      case "tool.approval-required":
        this.addActivity(
          threadId,
          "tool.approval",
          `Approval required: ${event.tool}`,
          { tool: event.tool, args: event.args, requestId: event.requestId },
        );
        break;
      case "message":
        this.addActivity(threadId, "message", event.content.slice(0, 500), {
          role: event.role,
        });
        break;
      case "session.started":
        this.addActivity(threadId, "session", "Session started");
        break;
      case "session.completed":
        this.addActivity(threadId, "session", "Session completed");
        break;
      case "session.error":
        this.addActivity(threadId, "error", event.error);
        break;
      case "activity":
        this.addActivity(threadId, event.kind, event.summary, event.payload);
        break;
    }
  }
}
