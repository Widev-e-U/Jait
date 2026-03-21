/**
 * Session service — CRUD for sessions in SQLite.
 */
import { and, eq, desc } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { sessions } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";

export interface CreateSessionParams {
  userId?: string;
  workspaceId?: string | null;
  name?: string;
  workspacePath?: string;
  metadata?: Record<string, unknown>;
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
      workspaceId: params.workspaceId ?? null,
      name: params.name ?? "New Chat",
      workspacePath: params.workspacePath ?? null,
      createdAt: now,
      lastActiveAt: now,
      status: "active",
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    }).run();

    return this.getById(id)!;
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

  listByWorkspace(workspaceId: string, status?: string, userId?: string, limit?: number) {
    const normalizedLimit =
      typeof limit === "number" && Number.isFinite(limit) && limit > 0
        ? Math.floor(limit)
        : undefined;
    let query = this.db.select().from(sessions).where(eq(sessions.workspaceId, workspaceId)).$dynamic();
    if (status && userId) {
      query = query.where(and(eq(sessions.workspaceId, workspaceId), eq(sessions.status, status), eq(sessions.userId, userId)));
    } else if (status) {
      query = query.where(and(eq(sessions.workspaceId, workspaceId), eq(sessions.status, status)));
    } else if (userId) {
      query = query.where(and(eq(sessions.workspaceId, workspaceId), eq(sessions.userId, userId)));
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

  /** Update session name, metadata, or workspacePath. */
  update(id: string, data: { name?: string; metadata?: Record<string, unknown>; workspacePath?: string | null; workspaceId?: string | null }, userId?: string) {
    const set: Record<string, string> = {};
    if (data.name !== undefined) set["name"] = data.name;
    if (data.metadata !== undefined) set["metadata"] = JSON.stringify(data.metadata);
    if (data.workspacePath != null) set["workspacePath"] = data.workspacePath;
    if (data.workspaceId != null) set["workspaceId"] = data.workspaceId;
    if (Object.keys(set).length > 0) {
      this.db
        .update(sessions)
        .set(set)
        .where(userId ? and(eq(sessions.id, id), eq(sessions.userId, userId)) : eq(sessions.id, id))
        .run();
    }
  }
}
