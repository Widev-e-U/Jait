import { eq, desc } from "drizzle-orm";
import type { JaitDB } from "../db/index.js";
import { scheduledJobs } from "../db/schema.js";
import { uuidv7 } from "../db/uuidv7.js";
import type { ToolResult } from "../tools/contracts.js";

export interface SchedulerToolExecution {
  toolName: string;
  input: unknown;
  sessionId: string;
  workspaceRoot: string;
  userId?: string | null;
}

export interface SchedulerExecutionResult {
  jobId: string;
  actionId: string;
  result: ToolResult;
}

export interface ScheduledJobRecord {
  id: string;
  userId: string | null;
  name: string;
  cron: string;
  toolName: string;
  input: unknown;
  sessionId: string;
  workspaceRoot: string;
  enabled: boolean;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SchedulerOptions {
  db: JaitDB;
  executeTool: (execution: SchedulerToolExecution) => Promise<ToolResult>;
  onExecuted?: (result: SchedulerExecutionResult) => void;
}

const MINUTE_MS = 60_000;

/**
 * Match a single cron field against a value.
 * Supports: "*" (any), exact number, comma lists, and step syntax.
 */
function matchCronField(field: string, value: number): boolean {
  if (field === "*") return true;
  // Step syntax: */N
  if (field.startsWith("*/")) {
    const step = Number.parseInt(field.slice(2), 10);
    return !Number.isNaN(step) && step > 0 && value % step === 0;
  }
  // Comma-separated list: 1,15,30
  if (field.includes(",")) {
    return field.split(",").some((v) => Number.parseInt(v.trim(), 10) === value);
  }
  // Exact match
  return Number.parseInt(field, 10) === value;
}

function matchesCronMinute(cron: string, date: Date): boolean {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const [minute, hour, dayOfMonth, month, weekday] = parts as [string, string, string, string, string];

  return (
    matchCronField(minute, date.getUTCMinutes()) &&
    matchCronField(hour, date.getUTCHours()) &&
    matchCronField(dayOfMonth, date.getUTCDate()) &&
    matchCronField(month, date.getUTCMonth() + 1) && // cron months are 1-12
    matchCronField(weekday, date.getUTCDay()) // cron weekdays: 0=Sun
  );
}

function isSameUtcMinute(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  const previous = new Date(iso);
  if (Number.isNaN(previous.getTime())) return false;
  return previous.getUTCFullYear() === now.getUTCFullYear()
    && previous.getUTCMonth() === now.getUTCMonth()
    && previous.getUTCDate() === now.getUTCDate()
    && previous.getUTCHours() === now.getUTCHours()
    && previous.getUTCMinutes() === now.getUTCMinutes();
}

function parseInput(input: string | null): unknown {
  if (!input) return {};
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return {};
  }
}

function normalizeToolName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  const firstUnderscore = trimmed.indexOf("_");
  if (firstUnderscore === -1) return trimmed;
  return `${trimmed.slice(0, firstUnderscore)}.${trimmed.slice(firstUnderscore + 1)}`;
}

function mapJob(row: typeof scheduledJobs.$inferSelect): ScheduledJobRecord {
  return {
    id: row.id,
    userId: row.userId ?? null,
    name: row.name,
    cron: row.cron,
    toolName: normalizeToolName(row.toolName),
    input: parseInput(row.input),
    sessionId: row.sessionId ?? "default",
    workspaceRoot: row.workspaceRoot ?? process.cwd(),
    enabled: row.enabled === 1,
    lastRunAt: row.lastRunAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class SchedulerService {
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  constructor(private options: SchedulerOptions) {}

  start(pollMs = MINUTE_MS) {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, pollMs);
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  list(userId?: string): ScheduledJobRecord[] {
    const rows = this.options.db
      .select()
      .from(scheduledJobs)
      .orderBy(desc(scheduledJobs.updatedAt))
      .all();
    const all = rows.map(mapJob);
    if (!userId) return all;
    // Include both the user's own jobs AND system-level jobs (userId === null)
    return all.filter((job) => job.userId === userId || job.userId === null);
  }

  create(params: {
    userId?: string;
    name: string;
    cron: string;
    toolName: string;
    input?: unknown;
    sessionId?: string;
    workspaceRoot?: string;
    enabled?: boolean;
  }): ScheduledJobRecord {
    const now = new Date().toISOString();
    const id = uuidv7();
    this.options.db.insert(scheduledJobs).values({
      id,
      userId: params.userId ?? null,
      name: params.name,
      cron: params.cron,
      toolName: normalizeToolName(params.toolName),
      input: JSON.stringify(params.input ?? {}),
      sessionId: params.sessionId ?? "default",
      workspaceRoot: params.workspaceRoot ?? process.cwd(),
      enabled: params.enabled === false ? 0 : 1,
      createdAt: now,
      updatedAt: now,
    }).run();

    return this.get(id)!;
  }

  get(id: string, userId?: string): ScheduledJobRecord | null {
    const row = this.options.db.select().from(scheduledJobs).where(eq(scheduledJobs.id, id)).get();
    const job = row ? mapJob(row) : null;
    if (!job) return null;
    // Allow access to system-level jobs (userId === null) for any authenticated user
    if (userId && job.userId !== null && job.userId !== userId) return null;
    return job;
  }

  remove(id: string, userId?: string): boolean {
    const exists = this.get(id, userId);
    if (!exists) return false;
    this.options.db.delete(scheduledJobs).where(eq(scheduledJobs.id, id)).run();
    return true;
  }

  update(
    id: string,
    patch: { name?: string; cron?: string; toolName?: string; enabled?: boolean; input?: unknown },
    userId?: string,
  ): ScheduledJobRecord | null {
    const existing = this.get(id, userId);
    if (!existing) return null;

    this.options.db.update(scheduledJobs).set({
      name: patch.name ?? existing.name,
      cron: patch.cron ?? existing.cron,
      toolName: patch.toolName ? normalizeToolName(patch.toolName) : existing.toolName,
      enabled: patch.enabled === undefined ? (existing.enabled ? 1 : 0) : (patch.enabled ? 1 : 0),
      input: patch.input === undefined ? JSON.stringify(existing.input) : JSON.stringify(patch.input),
      updatedAt: new Date().toISOString(),
    }).where(eq(scheduledJobs.id, id)).run();

    return this.get(id, userId);
  }

  async trigger(id: string, userId?: string, runAt = new Date()): Promise<SchedulerExecutionResult> {
    const job = this.get(id, userId);
    if (!job) {
      throw new Error(`Job not found: ${id}`);
    }

    const actionId = uuidv7();
    const result = await this.options.executeTool({
      toolName: normalizeToolName(job.toolName),
      input: job.input,
      sessionId: job.sessionId,
      workspaceRoot: job.workspaceRoot,
      userId: job.userId,
    });

    this.options.db.update(scheduledJobs).set({
      lastRunAt: runAt.toISOString(),
      updatedAt: new Date().toISOString(),
    }).where(eq(scheduledJobs.id, id)).run();

    const payload = { jobId: id, actionId, result };
    this.options.onExecuted?.(payload);
    return payload;
  }

  async tick(now = new Date()): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const jobs = this.list().filter((j) => j.enabled);
      for (const job of jobs) {
        if (matchesCronMinute(job.cron, now) && !isSameUtcMinute(job.lastRunAt, now)) {
          await this.trigger(job.id, undefined, now);
        }
      }
    } finally {
      this.ticking = false;
    }
  }
}
