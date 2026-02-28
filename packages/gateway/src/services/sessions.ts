/**
 * Session service — CRUD for sessions in SQLite.
 */
import { eq, desc } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { sessions } from "../db/schema.js";
import { uuidv7 } from "../lib/uuidv7.js";

export interface CreateSessionParams {
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
      name: params.name ?? `Session ${new Date().toLocaleString()}`,
      workspacePath: params.workspacePath ?? null,
      createdAt: now,
      lastActiveAt: now,
      status: "active",
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    }).run();

    return this.getById(id)!;
  }

  /** List all sessions, newest first. Optionally filter by status. */
  list(status?: string) {
    if (status) {
      return this.db
        .select()
        .from(sessions)
        .where(eq(sessions.status, status))
        .orderBy(desc(sessions.lastActiveAt))
        .all();
    }
    return this.db
      .select()
      .from(sessions)
      .orderBy(desc(sessions.lastActiveAt))
      .all();
  }

  /** Get a single session by ID. */
  getById(id: string) {
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
  archive(id: string) {
    this.db
      .update(sessions)
      .set({ status: "archived" })
      .where(eq(sessions.id, id))
      .run();
  }

  /** Get the most recently active session. */
  lastActive() {
    return this.db
      .select()
      .from(sessions)
      .where(eq(sessions.status, "active"))
      .orderBy(desc(sessions.lastActiveAt))
      .limit(1)
      .get() ?? null;
  }

  /** Delete (soft) a session. */
  delete(id: string) {
    this.db
      .update(sessions)
      .set({ status: "deleted" })
      .where(eq(sessions.id, id))
      .run();
  }

  /** Update session name or metadata. */
  update(id: string, data: { name?: string; metadata?: Record<string, unknown> }) {
    const set: Record<string, string> = {};
    if (data.name) set["name"] = data.name;
    if (data.metadata) set["metadata"] = JSON.stringify(data.metadata);
    if (Object.keys(set).length > 0) {
      this.db.update(sessions).set(set).where(eq(sessions.id, id)).run();
    }
  }
}
