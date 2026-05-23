import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { reminders } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";

export type ReminderStatus = "active" | "archived";
export type ReminderRow = typeof reminders.$inferSelect;

export interface CreateReminderParams {
  userId?: string | null;
  projectId?: string | null;
  sessionId?: string | null;
  content: string;
  sourceType?: string | null;
  sourceId?: string | null;
  sourceSurface?: string | null;
  status?: ReminderStatus;
  tags?: string[];
}

export interface UpdateReminderParams {
  content?: string;
  projectId?: string | null;
  sessionId?: string | null;
  status?: ReminderStatus;
  tags?: string[];
}

export interface ListReminderOptions {
  userId?: string;
  status?: ReminderStatus | "all";
  projectId?: string;
  sessionId?: string;
  limit?: number;
}

function normalizeTags(tags: string[] | undefined): string {
  return JSON.stringify([
    ...new Set(
      (tags ?? [])
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 20));
}

function normalizeLimit(limit: number | undefined, fallback = 100): number {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit < 1) return fallback;
  return Math.min(Math.floor(limit), 500);
}

export class ReminderService {
  constructor(private db: JaitDB) {}

  list(options: ListReminderOptions = {}): ReminderRow[] {
    const conditions = [];
    if (options.userId) conditions.push(eq(reminders.userId, options.userId));
    if (options.status && options.status !== "all") conditions.push(eq(reminders.status, options.status));
    if (options.projectId) conditions.push(eq(reminders.projectId, options.projectId));
    if (options.sessionId) conditions.push(eq(reminders.sessionId, options.sessionId));

    let query = this.db.select().from(reminders).$dynamic();
    if (conditions.length > 0) query = query.where(and(...conditions));
    return query
      .orderBy(desc(reminders.updatedAt))
      .limit(normalizeLimit(options.limit))
      .all();
  }

  listByIds(ids: string[]): ReminderRow[] {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return [];
    return this.db
      .select()
      .from(reminders)
      .where(inArray(reminders.id, uniqueIds))
      .all();
  }

  getById(id: string, userId?: string): ReminderRow | undefined {
    return this.db
      .select()
      .from(reminders)
      .where(userId ? and(eq(reminders.id, id), eq(reminders.userId, userId)) : eq(reminders.id, id))
      .get();
  }

  create(params: CreateReminderParams): ReminderRow {
    const content = params.content.trim();
    if (!content) throw new Error("Reminder content is required");
    const id = uuidv7();
    const now = new Date().toISOString();
    this.db.insert(reminders).values({
      id,
      userId: params.userId ?? null,
      projectId: params.projectId ?? null,
      sessionId: params.sessionId ?? null,
      content,
      sourceType: params.sourceType?.trim() || "agent",
      sourceId: params.sourceId?.trim() || null,
      sourceSurface: params.sourceSurface?.trim() || "chat",
      status: params.status ?? "active",
      tags: normalizeTags(params.tags),
      createdAt: now,
      updatedAt: now,
    }).run();
    return this.getById(id)!;
  }

  update(id: string, params: UpdateReminderParams, userId?: string): ReminderRow | undefined {
    const set: Partial<typeof reminders.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };
    if (params.content !== undefined) {
      const content = params.content.trim();
      if (!content) throw new Error("Reminder content must not be empty");
      set.content = content;
    }
    if (params.projectId !== undefined) set.projectId = params.projectId;
    if (params.sessionId !== undefined) set.sessionId = params.sessionId;
    if (params.status !== undefined) set.status = params.status;
    if (params.tags !== undefined) set.tags = normalizeTags(params.tags);

    this.db
      .update(reminders)
      .set(set)
      .where(userId ? and(eq(reminders.id, id), eq(reminders.userId, userId)) : eq(reminders.id, id))
      .run();
    return this.getById(id, userId);
  }

  delete(id: string, userId?: string): boolean {
    const existing = this.getById(id, userId);
    if (!existing) return false;
    this.db
      .delete(reminders)
      .where(userId ? and(eq(reminders.id, id), eq(reminders.userId, userId)) : eq(reminders.id, id))
      .run();
    return true;
  }

  countByProject(userId: string): Map<string, number> {
    const rows = this.db
      .select({
        projectId: reminders.projectId,
        count: sql<number>`count(*)`,
      })
      .from(reminders)
      .where(and(eq(reminders.userId, userId), eq(reminders.status, "active")))
      .groupBy(reminders.projectId)
      .all();
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (row.projectId) counts.set(row.projectId, Number(row.count));
    }
    return counts;
  }
}
