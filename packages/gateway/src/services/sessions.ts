/**
 * Session service — CRUD for sessions in SQLite.
 */
import { and, eq, desc, not, sql } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { messageContextMetadata, messages, sessions } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";

export interface CreateSessionParams {
  userId?: string;
  projectId?: string | null;
  name?: string;
  projectPath?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionForkLiveSnapshot {
  content: string;
  toolCalls?: string;
  segments?: string;
  thinking?: string;
}

export interface ForkSessionParams {
  userId: string;
  liveSnapshot?: SessionForkLiveSnapshot;
}

export class SessionService {
  constructor(private db: JaitDB) {}

  /** Create a new session. Returns the created session record. */
  create(params: CreateSessionParams = {}) {
    const id = uuidv7();
    const now = new Date().toISOString();

    this.db.insert(sessions).values({
      id,
      userId: params.userId ?? null,
      projectId: params.projectId ?? null,
      name: params.name ?? "New Chat",
      projectPath: params.projectPath ?? null,
      createdAt: now,
      lastActiveAt: now,
      status: "active",
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    }).run();

    return this.getById(id)!;
  }

  /** Create an independent chat from an immutable snapshot of another chat. */
  fork(sourceSessionId: string, params: ForkSessionParams) {
    const source = this.getById(sourceSessionId, params.userId);
    if (!source) return null;

    const branchSessionId = uuidv7();
    const forkedAt = new Date().toISOString();
    let metadata: Record<string, unknown> = {};
    if (source.metadata) {
      try {
        metadata = JSON.parse(source.metadata) as Record<string, unknown>;
      } catch {
        metadata = {};
      }
    }
    metadata["branch"] = {
      kind: "question",
      parentSessionId: source.id,
      forkedAt,
    };

    const sourceRows = this.db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, source.id))
      .orderBy(messages.createdAt, messages.id)
      .all();

    // A streaming assistant checkpoint belongs to the in-flight parent turn.
    // Replace it with the exact live accumulator captured at fork time so the
    // branch sees one frozen partial answer rather than two competing copies.
    if (params.liveSnapshot) {
      for (let index = sourceRows.length - 1; index >= 0; index--) {
        const row = sourceRows[index]!;
        if (row.role === "system") continue;
        if (row.role === "assistant") sourceRows.splice(index, 1);
        break;
      }
    }

    this.db.transaction((tx) => {
      tx.insert(sessions).values({
        id: branchSessionId,
        userId: params.userId,
        projectId: source.projectId,
        name: `Question · ${source.name?.trim() || "Chat"}`,
        projectPath: source.projectPath,
        createdAt: forkedAt,
        lastActiveAt: forkedAt,
        status: "active",
        metadata: JSON.stringify(metadata),
      }).run();

      for (const row of sourceRows) {
        const messageId = uuidv7();
        tx.insert(messages).values({
          id: messageId,
          sessionId: branchSessionId,
          role: row.role,
          content: row.content,
          toolCalls: row.toolCalls,
          segments: row.segments,
          contextFlow: row.contextFlow,
          thinking: row.thinking,
          createdAt: row.createdAt,
        }).run();
        if (row.contextFlow) {
          tx.insert(messageContextMetadata).values({
            messageId,
            hasMemoryProvenance:
              row.contextFlow.includes('"injectedIds":[')
              && !row.contextFlow.includes('"injectedIds":[]'),
          }).run();
        }
      }

      if (params.liveSnapshot) {
        tx.insert(messages).values({
          id: uuidv7(),
          sessionId: branchSessionId,
          role: "system",
          content: "Forked while the parent response was still running. The following assistant progress is an incomplete snapshot.",
          createdAt: forkedAt,
        }).run();
        const hasLiveAssistant = Boolean(
          params.liveSnapshot.content
          || params.liveSnapshot.thinking
          || params.liveSnapshot.toolCalls
          || params.liveSnapshot.segments,
        );
        if (hasLiveAssistant) {
          tx.insert(messages).values({
            id: uuidv7(),
            sessionId: branchSessionId,
            role: "assistant",
            content: params.liveSnapshot.content,
            toolCalls: params.liveSnapshot.toolCalls ?? null,
            segments: params.liveSnapshot.segments ?? null,
            thinking: params.liveSnapshot.thinking ?? null,
            createdAt: new Date(Date.parse(forkedAt) + 1).toISOString(),
          }).run();
        }
      }
    });

    return this.getById(branchSessionId, params.userId)!;
  }

  /** Count sessions (optionally by status) without materializing rows. */
  count(status?: string): number {
    if (status) {
      const row = this.db
        .select({ n: sql<number>`count(*)` })
        .from(sessions)
        .where(eq(sessions.status, status))
        .get();
      return row?.n ?? 0;
    }
    const row = this.db.select({ n: sql<number>`count(*)` }).from(sessions).get();
    return row?.n ?? 0;
  }

  /** List all sessions, newest first. Optionally filter by status. */
  list(status?: string, userId?: string, limit?: number) {
    const normalizedLimit =
      typeof limit === "number" && Number.isFinite(limit) && limit > 0
        ? Math.floor(limit)
        : undefined;

    if (status) {
      if (userId) {
        const query = this.db
          .select()
          .from(sessions)
          .where(and(eq(sessions.status, status), eq(sessions.userId, userId)))
          .orderBy(desc(sessions.lastActiveAt));
        return normalizedLimit ? query.limit(normalizedLimit).all() : query.all();
      }
      const query = this.db
        .select()
        .from(sessions)
        .where(eq(sessions.status, status))
        .orderBy(desc(sessions.lastActiveAt));
      return normalizedLimit ? query.limit(normalizedLimit).all() : query.all();
    }
    if (userId) {
      const query = this.db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, userId))
        .orderBy(desc(sessions.lastActiveAt));
      return normalizedLimit ? query.limit(normalizedLimit).all() : query.all();
    }
    const query = this.db
      .select()
      .from(sessions)
      .orderBy(desc(sessions.lastActiveAt));
    return normalizedLimit ? query.limit(normalizedLimit).all() : query.all();
  }

  listByProject(projectId: string, status?: string, userId?: string, limit?: number) {
    const normalizedLimit =
      typeof limit === "number" && Number.isFinite(limit) && limit > 0
        ? Math.floor(limit)
        : undefined;
    let query = this.db.select().from(sessions).where(eq(sessions.projectId, projectId)).$dynamic();
    if (status && userId) {
      query = query.where(and(eq(sessions.projectId, projectId), eq(sessions.status, status), eq(sessions.userId, userId)));
    } else if (status) {
      query = query.where(and(eq(sessions.projectId, projectId), eq(sessions.status, status)));
    } else if (userId) {
      query = query.where(and(eq(sessions.projectId, projectId), eq(sessions.userId, userId)));
    }
    query = query.orderBy(desc(sessions.lastActiveAt));
    return normalizedLimit ? query.limit(normalizedLimit).all() : query.all();
  }

  /** Get a single session by ID. */
  getById(id: string, userId?: string) {
    if (userId) {
      return this.db
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
        .get();
    }
    return this.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .get();
  }

  /** Touch the session (update last_active_at). */
  touch(id: string) {
    this.db
      .update(sessions)
      .set({ lastActiveAt: new Date().toISOString() })
      .where(eq(sessions.id, id))
      .run();
  }

  /**
   * Mark a session as read/viewed by the user. Only bumps viewed_at when the
   * session actually has unread activity (last_active_at newer than the last
   * view), so background activity doesn't keep resetting the timestamp.
   */
  markViewed(id: string, userId?: string) {
    const existing = this.getById(id, userId);
    if (!existing) return;
    const lastActive = Date.parse(existing.lastActiveAt);
    const viewed = existing.viewedAt ? Date.parse(existing.viewedAt) : 0;
    if (viewed >= lastActive) return;
    this.db
      .update(sessions)
      .set({ viewedAt: new Date().toISOString() })
      .where(userId ? and(eq(sessions.id, id), eq(sessions.userId, userId)) : eq(sessions.id, id))
      .run();
  }

  /** Archive a session. */
  archive(id: string, userId?: string) {
    this.db
      .update(sessions)
      .set({ status: "archived" })
      .where(userId ? and(eq(sessions.id, id), eq(sessions.userId, userId)) : eq(sessions.id, id))
      .run();
  }

  /** Get the most recently active session. */
  lastActive(userId?: string) {
    if (userId) {
      return this.db
        .select()
        .from(sessions)
        .where(and(eq(sessions.status, "active"), eq(sessions.userId, userId)))
        .orderBy(desc(sessions.lastActiveAt))
        .limit(1)
        .get() ?? null;
    }
    return this.db
      .select()
      .from(sessions)
      .where(eq(sessions.status, "active"))
      .orderBy(desc(sessions.lastActiveAt))
      .limit(1)
      .get() ?? null;
  }

  /** Delete (soft) a session. */
  delete(id: string, userId?: string) {
    this.db
      .update(sessions)
      .set({ status: "deleted" })
      .where(userId ? and(eq(sessions.id, id), eq(sessions.userId, userId)) : eq(sessions.id, id))
      .run();
  }

  /** Archive all active sessions in a project. */
  archiveByProject(projectId: string, userId?: string) {
    const conditions = [eq(sessions.projectId, projectId), eq(sessions.status, "active")];
    if (userId) conditions.push(eq(sessions.userId, userId));
    this.db.update(sessions).set({ status: "archived" }).where(and(...conditions)).run();
  }

  /** Restore all archived sessions in a project back to active. */
  restoreByProject(projectId: string, userId?: string) {
    const conditions = [eq(sessions.projectId, projectId), eq(sessions.status, "archived")];
    if (userId) conditions.push(eq(sessions.userId, userId));
    this.db.update(sessions).set({ status: "active" }).where(and(...conditions)).run();
  }

  /** Delete (soft) all non-deleted sessions in a project. */
  deleteByProject(projectId: string, userId?: string) {
    const conditions = [eq(sessions.projectId, projectId), not(eq(sessions.status, "deleted"))];
    if (userId) conditions.push(eq(sessions.userId, userId));
    this.db.update(sessions).set({ status: "deleted" }).where(and(...conditions)).run();
  }

  /**
   * Update session name, metadata, projectPath, or projectId.
   *
   * `undefined` leaves a field untouched, `null` clears it — clearing matters
   * for `projectId`, which is how a chat moves back out of a project into the
   * user's personal chats.
   */
  update(id: string, data: { name?: string; metadata?: Record<string, unknown>; projectPath?: string | null; projectId?: string | null }, userId?: string) {
    const set: Record<string, string | null> = {};
    if (data.name !== undefined) set["name"] = data.name;
    if (data.metadata !== undefined) set["metadata"] = JSON.stringify(data.metadata);
    if (data.projectPath !== undefined) set["projectPath"] = data.projectPath;
    if (data.projectId !== undefined) set["projectId"] = data.projectId;
    if (Object.keys(set).length > 0) {
      this.db
        .update(sessions)
        .set(set)
        .where(userId ? and(eq(sessions.id, id), eq(sessions.userId, userId)) : eq(sessions.id, id))
        .run();
    }
  }

  /**
   * Move a session into a project, or out of every project when `projectId`
   * is `null` (back to the user's personal chats).
   *
   * `projectPath` is moved along with it: tool execution resolves a session's
   * working directory as `project.rootPath ?? session.projectPath`, so leaving
   * the old path behind would keep pointing a personal chat at the folder of
   * the project it just left.
   */
  moveToProject(id: string, projectId: string | null, projectPath: string | null, userId?: string) {
    this.update(id, { projectId, projectPath }, userId);
    return this.getById(id, userId);
  }

  /**
   * Record which provider/model/reasoning-effort a chat was last used with,
   * merged into the session's `metadata.chat` field. This lets the chat/project
   * list render a provider icon per session without subscribing to its
   * (live, WS-only) session state.
   */
  updateChatSelection(
    id: string,
    selection: { provider?: string | null; model?: string | null; reasoningEffort?: string | null },
    userId?: string,
  ) {
    const existing = this.getById(id, userId);
    if (!existing) return;
    let metadata: Record<string, unknown> = {};
    if (existing.metadata) {
      try {
        metadata = JSON.parse(existing.metadata) as Record<string, unknown>;
      } catch {
        metadata = {};
      }
    }
    const chat = { ...(metadata["chat"] as Record<string, unknown> | undefined) };
    if (selection.provider !== undefined) chat["provider"] = selection.provider;
    if (selection.model !== undefined) chat["model"] = selection.model;
    if (selection.reasoningEffort !== undefined) chat["reasoningEffort"] = selection.reasoningEffort;
    metadata["chat"] = chat;
    this.update(id, { metadata }, userId);
  }
}
