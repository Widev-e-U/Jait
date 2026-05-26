import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { JaitDB } from "../db/connection.js";
import { messages, reminders, sessions } from "../db/schema.js";
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

export interface MemoryHygieneResult {
  archived: number;
  flagged: number;
}

export interface OldChatMemoryScanResult {
  scanned: number;
  created: number;
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

  markRetrieved(ids: string[], userId?: string): number {
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return 0;
    const now = new Date().toISOString();
    let updated = 0;
    for (const id of uniqueIds) {
      const existing = this.getById(id, userId);
      if (!existing) continue;
      this.db
        .update(reminders)
        .set({
          usageCount: (existing.usageCount ?? 0) + 1,
          lastRetrievedAt: now,
          updatedAt: now,
        })
        .where(userId ? and(eq(reminders.id, id), eq(reminders.userId, userId)) : eq(reminders.id, id))
        .run();
      updated += 1;
    }
    return updated;
  }

  exportMarkdown(options: ListReminderOptions = {}): string {
    const rows = this.list({ ...options, status: options.status ?? "all", limit: options.limit ?? 500 });
    const lines = ["# Memory Export", ""];
    for (const row of rows) {
      const tags = normalizeTagsForDisplay(row.tags);
      const meta = [
        row.status,
        row.projectId ? `project=${row.projectId}` : "project=none",
        row.sessionId ? `session=${row.sessionId}` : null,
        `source=${row.sourceType}:${row.sourceId ?? "none"}@${row.sourceSurface}`,
        `usage=${row.usageCount ?? 0}`,
        row.lastRetrievedAt ? `lastRetrieved=${row.lastRetrievedAt}` : null,
        tags.length > 0 ? `tags=${tags.join(",")}` : null,
        `updated=${row.updatedAt}`,
      ].filter(Boolean).join("; ");
      lines.push(`- ${row.content} (${meta})`);
    }
    lines.push("");
    return lines.join("\n");
  }

  runHygiene(userId?: string): MemoryHygieneResult {
    const active = this.list({ userId, status: "active", limit: 500 });
    const now = Date.now();
    let archived = 0;
    let flagged = 0;

    for (const row of active) {
      const updatedAt = new Date(row.updatedAt).getTime();
      const ageDays = Number.isFinite(updatedAt) ? (now - updatedAt) / 86_400_000 : 0;
      if ((row.usageCount ?? 0) === 0 && ageDays >= 180 && row.sourceType !== "user") {
        this.update(row.id, { status: "archived" }, userId);
        archived += 1;
      }
    }

    const bySubject = new Map<string, ReminderRow[]>();
    for (const row of active) {
      const subject = memorySubject(row.content);
      if (!subject) continue;
      const bucket = bySubject.get(subject) ?? [];
      bucket.push(row);
      bySubject.set(subject, bucket);
    }

    for (const bucket of bySubject.values()) {
      const uniqueContents = new Set(bucket.map((row) => normalizeMemoryText(row.content)));
      if (uniqueContents.size < 2) continue;
      for (const row of bucket) {
        const tags = [...new Set([...normalizeTagsForDisplay(row.tags), "review:conflict", "memory:hygiene"])];
        this.update(row.id, { tags }, userId);
        flagged += 1;
      }
    }

    return { archived, flagged };
  }

  scanOldChatsForMemory(userId?: string, limit = 200): OldChatMemoryScanResult {
    const rows = this.db
      .select({
        messageId: messages.id,
        sessionId: messages.sessionId,
        projectId: sessions.projectId,
        content: messages.content,
      })
      .from(messages)
      .innerJoin(sessions, eq(messages.sessionId, sessions.id))
      .where(userId ? and(eq(sessions.userId, userId), eq(messages.role, "user")) : eq(messages.role, "user"))
      .orderBy(desc(messages.createdAt))
      .limit(normalizeLimit(limit, 200))
      .all();

    const existing = new Set(this.list({ userId, status: "all", limit: 500 }).map((row) => normalizeMemoryText(row.content)));
    let created = 0;
    for (const row of rows) {
      const candidate = extractDurableMemoryCandidate(row.content);
      if (!candidate) continue;
      const normalized = normalizeMemoryText(candidate);
      if (existing.has(normalized)) continue;
      this.create({
        userId: userId ?? null,
        projectId: row.projectId,
        sessionId: row.sessionId,
        content: candidate,
        sourceType: "background_memory_scan",
        sourceId: row.messageId,
        sourceSurface: "chat",
        tags: ["memory-scan"],
      });
      existing.add(normalized);
      created += 1;
    }

    return { scanned: rows.length, created };
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

function normalizeTagsForDisplay(tags: string): string[] {
  try {
    const parsed = JSON.parse(tags) as unknown;
    return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === "string") : [];
  } catch {
    return [];
  }
}

function normalizeMemoryText(content: string): string {
  return content.toLowerCase().replace(/\s+/g, " ").trim();
}

function memorySubject(content: string): string | null {
  const tokens = normalizeMemoryText(content)
    .split(/[^a-z0-9_]+/)
    .filter((token) => token.length >= 3 && !["the", "and", "for", "with", "that", "this", "memory", "prefer", "always", "should", "use", "not", "don", "never"].includes(token));
  return tokens.slice(0, 5).join(" ") || null;
}

function extractDurableMemoryCandidate(content: string): string | null {
  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length < 12 || compact.length > 600) return null;
  if (!/\b(remember|always|prefer|preference|use .+ by default|do not|don't|never)\b/i.test(compact)) return null;
  return compact.length <= 280 ? compact : `${compact.slice(0, 279)}…`;
}
